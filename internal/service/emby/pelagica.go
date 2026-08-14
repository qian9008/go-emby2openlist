package emby

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"
	"github.com/gin-gonic/gin"
)

var (
	pelagicaProxy *httputil.ReverseProxy
	pelagicaOnce  sync.Once
	backendCmd    *exec.Cmd
	backendMu     sync.Mutex
)

// ProxyPelagica 代理 Pelagica 后端的 API 请求
func ProxyPelagica(c *gin.Context) {
	pelagicaOnce.Do(func() {
		target, err := url.Parse(config.C.Ge2o.PelagicaBackendUrl)
		if err != nil {
			panic("Failed to parse pelagica-backend-url: " + err.Error())
		}
		pelagicaProxy = httputil.NewSingleHostReverseProxy(target)

		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.Proxy = nil
		pelagicaProxy.Transport = transport
	})

	pelagicaProxy.ServeHTTP(c.Writer, c.Request)
}

// StartPelagicaBackend 启动 Pelagica 后端子进程
func StartPelagicaBackend() {
	if config.C.Ge2o.StartPelagicaBackend == nil || !*config.C.Ge2o.StartPelagicaBackend {
		logs.Info("Pelagica 后端自动启动已关闭")
		return
	}

	backendMu.Lock()
	defer backendMu.Unlock()

	if backendCmd != nil {
		return
	}

	execPath := config.C.Ge2o.PelagicaBackendPath

	// 在 Windows 下，如果配置路径没有 .exe 扩展名且找不到文件，尝试自动补全 .exe
	if filepath.Ext(execPath) == "" {
		if _, err := os.Stat(execPath); os.IsNotExist(err) {
			exePath := execPath + ".exe"
			if _, errExe := os.Stat(exePath); errExe == nil {
				execPath = exePath
			}
		}
	}

	// 检查程序是否存在
	if _, err := os.Stat(execPath); os.IsNotExist(err) {
		logs.Warn("找不到 Pelagica 后端可执行文件: %s，跳过自动启动。如需使用，请确保编译并放置该文件。", execPath)
		return
	}

	logs.Info("正在启动 Pelagica 后端子进程: %s...", execPath)

	// 解析转发地址中的端口号以设置子进程环境变量 PORT
	port := "4321" // 默认端口
	u, err := url.Parse(config.C.Ge2o.PelagicaBackendUrl)
	if err == nil && u.Port() != "" {
		port = u.Port()
	}

	cmd := exec.Command(execPath)
	cmd.Dir = filepath.Dir(execPath)

	// 继承当前环境变量，并覆盖 PORT 等 Pelagica 后端环境变量
	cmd.Env = os.Environ()
	cmd.Env = append(cmd.Env, "PORT="+port)
	// 如果配置了本地存储目录，可以继承或在 config.yml 统一设置
	if os.Getenv("CONFIG_PATH") == "" {
		cmd.Env = append(cmd.Env, "CONFIG_PATH=config/pelagica-config.json")
	}
	if os.Getenv("THEMES_DIR") == "" {
		cmd.Env = append(cmd.Env, "THEMES_DIR=config/themes")
	}
	if os.Getenv("STUDIO_THUMBS") == "" {
		cmd.Env = append(cmd.Env, "STUDIO_THUMBS=config/studio_thumbs")
	}
	if os.Getenv("BRANDING_DIR") == "" {
		cmd.Env = append(cmd.Env, "BRANDING_DIR=config/branding")
	}

	// 重定向输出到标准输出/错误，方便在控制台查看日志
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		logs.Error("启动 Pelagica 后端子进程失败: %v", err)
		return
	}

	backendCmd = cmd
	logs.Success("Pelagica 后端子进程已成功启动 (PID: %d)", cmd.Process.Pid)

	// 监听进程退出状态并自动清理
	go func() {
		err := cmd.Wait()
		backendMu.Lock()
		defer backendMu.Unlock()
		if backendCmd == cmd {
			logs.Warn("Pelagica 后端子进程退出，返回: %v", err)
			backendCmd = nil
		}
	}()
}

// StopPelagicaBackend 停止 Pelagica 后端子进程
func StopPelagicaBackend() {
	backendMu.Lock()
	defer backendMu.Unlock()

	if backendCmd == nil {
		return
	}

	logs.Info("正在停止 Pelagica 后端子进程 (PID: %d)...", backendCmd.Process.Pid)

	// 优雅杀死子进程，在所有系统下使用 Kill() 都是可行的
	err := backendCmd.Process.Kill()
	if err != nil {
		logs.Warn("停止 Pelagica 后端子进程失败: %v", err)
	} else {
		// 给一点时间清理资源
		time.Sleep(100 * time.Millisecond)
		logs.Success("Pelagica 后端子进程已停止")
	}
	backendCmd = nil
}

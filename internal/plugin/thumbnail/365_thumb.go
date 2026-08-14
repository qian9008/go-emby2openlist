package thumbnail

import (
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/openlist"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/https"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"
)

func init() {
	openlist.AfterFsGetHooks = append(openlist.AfterFsGetHooks, func(res *openlist.FsGet, path string) {
		// 365-enable 缩略图下载开关
		if config.C.Openlist.Enable365 && res.Thumb != "" {
			// 修改链接中部分地址参数为 width=500&height=500
			u, err := url.Parse(res.Thumb)
			if err == nil {
				q := u.Query()
				q.Set("width", "500")
				q.Set("height", "500")
				u.RawQuery = q.Encode()
				res.Thumb = u.String()
			}
			// 下载图片保存为 响应的 name 的文件名 .jpg
			go download365Thumb(path, res.Thumb, res.Name)
		}
	})
	logs.Info("已加载 365 缩略图插件钩子")
}

// download365Thumb 下载 365 缩略图并保存到本地对应路径下
func download365Thumb(path string, thumbUrl string, name string) {
	if thumbUrl == "" || name == "" {
		return
	}

	// 1. 获取本地文件目录，和 localtree 的目录规则保持一致
	localDir := filepath.Join(config.BasePath, "openlist-local-tree", filepath.FromSlash(filepath.Dir(path)))
	if err := os.MkdirAll(localDir, os.ModePerm); err != nil {
		logs.Error("创建 365 缩略图存储目录失败 [%s]: %v", localDir, err)
		return
	}

	// 2. 确定文件名，后缀修改为 .jpg
	baseName := name
	if idx := strings.LastIndex(baseName, "."); idx != -1 {
		baseName = baseName[:idx]
	}
	jpgPath := filepath.Join(localDir, baseName+".jpg")

	if _, err := os.Stat(jpgPath); err == nil {
		return
	}

	logs.Info("开始下载 365 缩略图, 链接: %s, 保存路径: %s", thumbUrl, jpgPath)

	// 3. 发送请求下载图片
	resp, err := https.Get(thumbUrl).Do()
	if err != nil {
		logs.Error("请求 365 缩略图失败: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logs.Error("请求 365 缩略图失败, 响应码: %d", resp.StatusCode)
		return
	}

	// 4. 保存为文件
	file, err := os.Create(jpgPath)
	if err != nil {
		logs.Error("创建 365 缩略图文件失败 [%s]: %v", jpgPath, err)
		return
	}
	defer file.Close()

	_, err = io.Copy(file, resp.Body)
	if err != nil {
		logs.Error("保存 365 缩略图失败: %v", err)
		return
	}

	logs.Success("成功下载并保存 365 缩略图: %s", jpgPath)
}

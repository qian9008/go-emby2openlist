package web

import (
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/constant"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"
	web_static "github.com/AmbitiousJun/go-emby2openlist/v2/web"
	"github.com/gin-gonic/gin"
)

// MatchRouteKey 存储在 gin 上下文的路由匹配字段
const MatchRouteKey = "matchRoute"

// globalDftHandler 全局默认兜底的请求处理器
func globalDftHandler(c *gin.Context) {
	if c.Request.Method == http.MethodHead {
		c.String(http.StatusOK, "")
		return
	}

	uri := c.Request.RequestURI
	pathPart := uri
	queryPart := ""
	if qIdx := strings.Index(uri, "?"); qIdx != -1 {
		pathPart = uri[:qIdx]
		queryPart = uri[qIdx:]
	}
	for strings.Contains(pathPart, "//") {
		pathPart = strings.ReplaceAll(pathPart, "//", "/")
	}
	cleanedURI := pathPart + queryPart

	// 1. 如果配置了 Pelagica 前端目录，尝试服务 Pelagica 静态文件或 SPA 页面
	if servePelagicaStatic(c, cleanedURI) {
		return
	}

	// 2. 尝试服务官方 Web 控制面板静态资源
	if handleWebStatic(c) {
		return
	}

	// 依次匹配路由规则, 找到其他的处理器
	for _, rule := range rules {
		reg := rule[0].(*regexp.Regexp)
		if reg.MatchString(cleanedURI) {
			c.Set(MatchRouteKey, reg.String())
			c.Set(constant.RouteSubMatchGinKey, reg.FindStringSubmatch(cleanedURI))
			rule[1].(gin.HandlerFunc)(c)
			return
		}
	}
}

// servePelagicaStatic 尝试接管静态文件和前端 SPA 路由的渲染
func servePelagicaStatic(c *gin.Context, cleanedURI string) bool {
	dir := config.C.Ge2o.PelagicaFrontendDir
	if dir == "" {
		return false
	}

	path := c.Request.URL.Path

	// 1. 排除 API 接口、分享系统以及特殊内部路由
	if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/ge2o") {
		return false
	}
	// 排除 WebSocket 长连接
	if regexp.MustCompile(`(?i)^/.*(socket|embywebsocket)`).MatchString(path) {
		return false
	}
	// 排除原始 Emby 关键 API 路径以及 Web 后台地址
	if strings.HasPrefix(path, "/Items") || strings.HasPrefix(path, "/Users") ||
		strings.HasPrefix(path, "/Videos") || strings.HasPrefix(path, "/Sessions") ||
		strings.HasPrefix(path, "/Images") || strings.HasPrefix(path, "/Audio") ||
		strings.HasPrefix(path, "/web") {
		return false
	}

	// 2. 检查本地是否存在物理文件，如果存在则直接响应
	filePath := filepath.Join(dir, path)
	stat, err := os.Stat(filePath)
	if err == nil && !stat.IsDir() {
		c.File(filePath)
		return true
	}

	// 3. 匹配 Pelagica 前端 SPA 页面路径。当刷新页面或输入特定路由时，返回 index.html。
	isSpaRoute := false
	if path == "/" || path == "/index.html" {
		isSpaRoute = true
	} else {
		// 精确匹配或前缀匹配主要的 SPA 路由
		spaPrefixes := []string{"/library", "/shared-library", "/item/", "/person/", "/login", "/play/", "/settings", "/browse-themes", "/search"}
		for _, prefix := range spaPrefixes {
			if path == prefix || strings.HasPrefix(path, prefix) {
				isSpaRoute = true
				break
			}
		}
	}

	if isSpaRoute {
		indexPath := filepath.Join(dir, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			c.File(indexPath)
			return true
		}
	}

	return false
}

// handleWebStatic 处理 web 静态资源
func handleWebStatic(c *gin.Context) (ok bool) {
	if !config.C.Ge2o.Web.IsEnabled() {
		return false
	}

	path := c.Request.URL.Path

	if strings.TrimRight(path, "/") == constant.Route_SelfBase {
		c.Redirect(http.StatusMovedPermanently, constant.Route_Web+"/")
		return true
	}

	feFS, err := fs.Sub(web_static.EmbedFS, "dist")
	if err != nil {
		logs.Error("获取静态资源文件系统失败: %v", err)
		return false
	}

	if !strings.HasPrefix(path, constant.Route_Web) {
		return false
	}

	serveIndexHtml := func() {
		data, err := fs.ReadFile(feFS, "index.html")
		if err != nil {
			logs.Error("读取 index.html 失败: %v", err)
			c.String(http.StatusInternalServerError, "Internal Server Error")
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", data)
	}

	filePath := strings.TrimPrefix(path, constant.Route_Web)
	filePath = strings.TrimPrefix(filePath, "/")

	if filePath == "" {
		serveIndexHtml()
		return true
	}

	// 检查文件是否存在
	file, err := feFS.Open(filePath)
	if err != nil {
		serveIndexHtml()
		return true
	}
	file.Close()

	// 文件存在 直接返回相应的静态资源
	c.FileFromFS("/"+filePath, http.FS(feFS))
	return true
}

// compileRules 编译路由的正则表达式
func compileRules(rs [][2]any) [][2]any {
	newRs := make([][2]any, 0, len(rs))
	for _, rule := range rs {
		reg, err := regexp.Compile(rule[0].(string))
		if err != nil {
			logs.Error("路由正则编译失败, pattern: %v, error: %v", rule[0], err)
			continue
		}
		rule[0] = reg

		rawHandler, ok := rule[1].(func(*gin.Context))
		if !ok {
			logs.Error("错误的请求处理器, pattern: %v", rule[0])
			continue
		}
		var handler gin.HandlerFunc = rawHandler
		rule[1] = handler
		newRs = append(newRs, rule)
	}
	return newRs
}


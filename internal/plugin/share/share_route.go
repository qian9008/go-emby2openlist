package share

import (
	"net/http"
	"strings"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/constant"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/emby"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/share"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/web"
	"github.com/gin-gonic/gin"
)

func init() {
	// 注册配置加载完成的钩子，以安全初始化分享数据存储
	config.OnConfigLoadedHooks = append(config.OnConfigLoadedHooks, share.Init)

	// 注册额外路由，指定优先级 100，确保高于 Pelagica 网关的通配路由
	web.RegisterExtraRule(constant.Route_ShareUsers, shareMethodGuard("GET", share.HandleGetUsers), 100)
	web.RegisterExtraRule(constant.Route_ShareCreate, shareMethodGuard("POST", share.HandleCreateShare), 100)
	web.RegisterExtraRule(constant.Route_ShareMine, shareMethodGuard("GET", share.HandleGetMine), 100)
	web.RegisterExtraRule(constant.Route_SharedWithMe, shareMethodGuard("GET", share.HandleGetSharedWithMe), 100)
	web.RegisterExtraRule(constant.Route_ShareDebugLogs, shareMethodGuard("GET", share.HandleGetDebugLogs), 100)
	web.RegisterExtraRule(constant.Route_ShareById, shareMethodRouter(), 100)

	logs.Info("已加载 Share 路由插件")
}

// setCORSHeaders 设置本地响应的 CORS 跨域响应头
func setCORSHeaders(c *gin.Context) {
	origin := c.Request.Header.Get("Origin")
	if origin == "" {
		// 如果 Origin 为空，尝试从 Referer 提取（防某些反代丢 Origin 头的问题）
		referer := c.Request.Header.Get("Referer")
		if referer != "" {
			if idx := strings.Index(referer, "://"); idx != -1 {
				rest := referer[idx+3:]
				if nextSlash := strings.Index(rest, "/"); nextSlash != -1 {
					origin = referer[:idx+3+nextSlash]
				} else {
					origin = referer
				}
			}
		}
	}
	if origin == "" {
		// 如果还是为空，通过 Host 自动推导 Origin
		scheme := "http"
		if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		origin = scheme + "://" + c.Request.Host
	}

	c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
	c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
	c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Emby-Token, X-MediaBrowser-Token, X-Emby-Authorization")
	c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")
}

// shareMethodGuard 方法守卫: 仅允许指定 HTTP 方法通过, 否则回源代理
func shareMethodGuard(method string, handler func(*gin.Context)) func(*gin.Context) {
	return func(c *gin.Context) {
		if c.Request.Method == method {
			setCORSHeaders(c)
			handler(c)
		} else if c.Request.Method == http.MethodOptions {
			setCORSHeaders(c)
			c.Status(http.StatusNoContent)
		} else {
			emby.ProxyOrigin(c)
		}
	}
}

// shareMethodRouter 根据 HTTP 方法分发到不同的分享处理器
func shareMethodRouter() func(*gin.Context) {
	return func(c *gin.Context) {
		switch c.Request.Method {
		case "GET":
			setCORSHeaders(c)
			share.HandleGetShareDetail(c)
		case "DELETE":
			setCORSHeaders(c)
			share.HandleDeleteShare(c)
		case "OPTIONS":
			setCORSHeaders(c)
			c.Status(http.StatusNoContent)
		default:
			emby.ProxyOrigin(c)
		}
	}
}

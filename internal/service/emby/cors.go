package emby

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/bytess"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/https"
	"github.com/gin-gonic/gin"
)

// setCORSHeaders 设置本地响应的 CORS 跨域响应头
func setCORSHeaders(c *gin.Context) {
	origin := c.Request.Header.Get("Origin")
	if origin == "" {
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

// handleCORSAndOPTIONS 处理 CORS 跨域请求和 OPTIONS 预检请求
func handleCORSAndOPTIONS(c *gin.Context) bool {
	setCORSHeaders(c)
	if c.Request.Method == http.MethodOptions {
		c.Status(http.StatusNoContent)
		c.Abort()
		return true
	}
	return false
}


// ChangeBaseVideoModuleCorsDefined 调整 emby 的播放器 cors 配置, 使其支持跨域播放
func ChangeBaseVideoModuleCorsDefined(c *gin.Context) {
	// 1 代理请求
	c.Request.Header.Del("If-Modified-Since")
	c.Request.Header.Del("If-None-Match")
	resp, err := https.ProxyRequest(c.Request, config.C.Emby.Host)
	if checkErr(c, err) {
		return
	}
	if resp.StatusCode != http.StatusOK {
		checkErr(c, fmt.Errorf("emby 返回非预期状态码: %d", resp.StatusCode))
		return
	}
	resp.Header.Del("Content-Length")
	defer resp.Body.Close()

	// 2 注入 JS 代码补丁
	modObj := `window.defined['modules/htmlvideoplayer/plugin.js']`
	modObjDefault := modObj + ".default"
	modObjPrototype := modObjDefault + ".prototype"
	modObjCorsFunc := modObjPrototype + ".getCrossOriginValue"
	jsScript := fmt.Sprintf(`(function(){ var modFunc; modFunc = function(){if(!%s||!%s||!%s||!%s){console.log('emby 未初始化完成...');setTimeout(modFunc);return;}%s=function(mediaSource,playMethod){return null;};console.log('cors 脚本补丁已注入')}; modFunc() })()`, modObj, modObjDefault, modObjPrototype, modObjCorsFunc, modObjCorsFunc)

	c.Status(http.StatusOK)
	https.CloneHeader(c.Writer, resp.Header)

	buf := bytess.CommonFixedBuffer()
	defer buf.PutBack()
	io.CopyBuffer(c.Writer, resp.Body, buf.Bytes())

	c.Writer.Write([]byte(jsScript))
	c.Writer.Flush()
}

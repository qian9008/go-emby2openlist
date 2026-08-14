package web

import (
	"strconv"
	"strings"
	"time"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/constant"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/https"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs/colors"
	"github.com/gin-gonic/gin"
)

func CustomLogger(port string) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()

		// 处理请求
		c.Next()

		// 检查是否需要过滤日志
		if config.C != nil && config.C.Log != nil && !config.C.Log.Verbose {
			status := c.Writer.Status()
			if status < 400 {
				path := c.Request.URL.Path

				// 1. 过滤图片获取
				if strings.HasPrefix(path, "/images") || strings.Contains(path, "/Images/") {
					return
				}
				// 2. 过滤播放进度上报与播放停止上报
				if strings.Contains(path, "/sessions/playing/") || strings.Contains(path, "/Sessions/Playing/") {
					return
				}
				// 3. 过滤 WebSocket 握手和心跳
				if strings.Contains(path, "socket") || strings.Contains(path, "embywebsocket") {
					return
				}
				// 4. 过滤字幕请求
				if strings.Contains(path, "/subtitles") || strings.Contains(path, "proxy_subtitle") {
					return
				}
				// 5. 过滤前端静态资源文件等
				if strings.HasPrefix(path, "/web/") {
					return
				}

				// 6. 过滤用户自定义的忽略路径
				for _, ip := range config.C.Log.IgnorePaths {
					if ip != "" && (path == ip || strings.Contains(path, ip)) {
						return
					}
				}
			}
		}

		// 记录日志
		logs.Raw("%s %s | %s | %s | %s | %s %s | %s %s\n",
			colors.ToYellow("[ge2o:"+constant.CurrentVersion+"]"),
			start.Format("2006-01-02 15:04:05"),
			colorStatusCode(c.Writer.Status()),
			time.Since(start),
			c.ClientIP(),
			colors.ToBlue(port),
			colors.ToBlue(c.GetString(MatchRouteKey)),
			colors.ToBlue(c.Request.Method),
			c.Request.RequestURI,
		)
	}
}

// colorStatusCode 将响应码打上颜色标记
func colorStatusCode(code int) string {
	str := strconv.Itoa(code)
	if https.IsSuccessCode(code) || https.IsRedirectCode(code) {
		return colors.ToGreen(str)
	}
	if https.IsErrorCode(code) {
		return colors.ToRed(str)
	}
	return colors.ToBlue(str)
}

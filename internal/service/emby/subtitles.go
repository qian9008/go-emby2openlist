package emby

import (
	"net/http"
	"net/url"
	"regexp"
	"time"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/strs"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/web/cache"
	"github.com/gin-gonic/gin"
)

// ProxySubtitles 字幕代理, 过期时间设置为 30 天
func ProxySubtitles(c *gin.Context) {
	if c == nil {
		return
	}

	// 判断是否带有转码字幕参数
	openlistPath := c.Query("openlist_path")
	templateId := c.Query("template_id")
	subName := c.Query("sub_name")
	apiKey := c.Query(QueryApiKeyName)
	if strs.AllNotEmpty(openlistPath, templateId, subName, apiKey) {
		u, _ := url.Parse("/videos/proxy_subtitle")
		u.RawQuery = c.Request.URL.RawQuery
		c.Redirect(http.StatusTemporaryRedirect, u.String())
		return
	}

	// 拦截分享资源字幕：如果当前资源被分享给了当前请求用户，将 ApiKey 提升至管理员 Key 运行以获取字幕
	path := c.Request.URL.Path
	var itemId string
	if matches := regexp.MustCompile(`(?i)/videos/([0-9a-f]+)/`).FindStringSubmatch(path); len(matches) > 1 {
		itemId = matches[1]
	}
	if itemId != "" {
		TryElevateSharedResourceCredentials(c, itemId)
	}

	c.Header(cache.HeaderKeyExpired, cache.Duration(time.Hour*24*30))
	ProxyOrigin(c)
}

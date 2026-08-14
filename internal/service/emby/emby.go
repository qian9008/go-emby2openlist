package emby

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/share"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/bytess"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/https"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/jsons"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"

	"github.com/gin-gonic/gin"
)

func ProxySocket() func(*gin.Context) {

	var proxy *httputil.ReverseProxy
	var once = sync.Once{}

	initFunc := func() {
		origin := config.C.Emby.Host
		u, err := url.Parse(origin)
		if err != nil {
			panic("转换 emby host 异常: " + err.Error())
		}

		proxy = httputil.NewSingleHostReverseProxy(u)

		// 禁用系统代理
		transport := http.DefaultTransport.(*http.Transport).Clone()
		transport.Proxy = nil
		proxy.Transport = transport

		proxy.Director = func(r *http.Request) {
			r.URL.Scheme = u.Scheme
			r.URL.Host = u.Host
		}
	}

	return func(c *gin.Context) {
		once.Do(initFunc)
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

// HandleImages 处理图片请求
//
// 修改图片质量参数为配置值，并在访问共享媒体图片时自动提权
func HandleImages(c *gin.Context) {
	q := c.Request.URL.Query()
	q.Del("quality")
	q.Del("Quality")
	q.Set("Quality", strconv.Itoa(config.C.Emby.ImagesQuality))

	// 拦截分享资源图片：如果当前资源被分享给了当前请求用户，将 ApiKey 提升至管理员 Key 运行以获取图片
	path := c.Request.URL.Path
	var itemId string
	if matches := regexp.MustCompile(`(?i)/items/([0-9a-f]+)/images`).FindStringSubmatch(path); len(matches) > 1 {
		itemId = matches[1]
	}

	if itemId != "" {
		TryElevateSharedResourceCredentials(c, itemId)
		// 重新加载已修改的 query
		q = c.Request.URL.Query()
	}

	c.Request.RequestURI = c.Request.URL.Path + "?" + q.Encode()
	ProxyOrigin(c)
}

// TryElevateSharedResourceCredentials 尝试为被分享的资源请求（如图片、字幕）进行管理员权限提权
func TryElevateSharedResourceCredentials(c *gin.Context, itemId string) {
	if itemId == "" {
		return
	}
	currentUser, errUser := share.GetCurrentUser(c)
	if errUser == nil && currentUser.Id != "" {
		if share.IsSharedTo(itemId, currentUser.Id) {
			adminKey := config.C.Emby.AdminApiKey
			if adminKey != "" {
				logs.Info("用户 %s 请求共享资源 %s 的附件/媒体流, 权限已自动提升为 Admin", currentUser.Name, itemId)
				
				// 替换 query 中的 api_key / token 等
				q := c.Request.URL.Query()
				if q.Get("api_key") != "" {
					q.Set("api_key", adminKey)
				}
				if q.Get("token") != "" {
					q.Set("token", adminKey)
				}
				c.Request.URL.RawQuery = q.Encode()
				
				// 替换 headers 中的 X-Emby-Token 等
				c.Request.Header.Del("X-Emby-Token")
				c.Request.Header.Set("X-Emby-Token", adminKey)
				
				if c.Request.Header.Get("X-MediaBrowser-Token") != "" {
					c.Request.Header.Set("X-MediaBrowser-Token", adminKey)
				}
				
				if auth := c.Request.Header.Get("Authorization"); auth != "" {
					c.Request.Header.Set("Authorization", rewriteAuthorizationToken(auth, adminKey))
				}
				
				if auth := c.Request.Header.Get("X-Emby-Authorization"); auth != "" {
					c.Request.Header.Set("X-Emby-Authorization", rewriteAuthorizationToken(auth, adminKey))
				}
			}
		}
	}
}

func rewriteAuthorizationToken(authHeader, adminKey string) string {
	reg := regexp.MustCompile(`(?i)token="[^"]+"`)
	if reg.MatchString(authHeader) {
		return reg.ReplaceAllString(authHeader, fmt.Sprintf(`Token="%s"`, adminKey))
	}
	regNoQuote := regexp.MustCompile(`(?i)token=[^,]+`)
	if regNoQuote.MatchString(authHeader) {
		return regNoQuote.ReplaceAllString(authHeader, fmt.Sprintf(`Token=%s`, adminKey))
	}
	return authHeader
}

// ProxyOrigin 将请求代理到源服务器
func ProxyOrigin(c *gin.Context) {
	if c == nil {
		return
	}
	origin := config.C.Emby.Host

	// 传递客户端 IP 到 emby
	c.Request.Header.Set("X-Forwarded-For", c.ClientIP())
	c.Request.Header.Set("X-Real-IP", c.ClientIP())

	if err := https.ProxyPass(c.Request, c.Writer, origin); err != nil {
		logs.Error("代理异常: %v", err)
	}
}

// TestProxyUri 用于测试的代理,
// 主要是为了查看实际请求的详细信息, 方便测试
func TestProxyUri(c *gin.Context) bool {
	testUris := []string{}

	flag := false
	for _, uri := range testUris {
		if strings.Contains(c.Request.RequestURI, uri) {
			flag = true
			break
		}
	}
	if !flag {
		return false
	}

	type TestInfos struct {
		Uri        string
		Method     string
		Header     map[string]string
		Body       string
		RespStatus int
		RespHeader map[string]string
		RespBody   string
	}

	infos := &TestInfos{
		Uri:        c.Request.URL.String(),
		Method:     c.Request.Method,
		Header:     make(map[string]string),
		RespHeader: make(map[string]string),
	}

	for key, values := range c.Request.Header {
		infos.Header[key] = strings.Join(values, "|")
	}

	bodyBytes, err := io.ReadAll(c.Request.Body)
	if err != nil {
		logs.Error("测试 uri 执行异常: %v", err)
		return false
	}
	infos.Body = string(bodyBytes)

	origin := config.C.Emby.Host
	resp, err := https.Request(infos.Method, origin+infos.Uri).
		Header(c.Request.Header).
		Body(io.NopCloser(bytes.NewBuffer(bodyBytes))).
		Do()
	if err != nil {
		logs.Error("测试 uri 执行异常: %v", err)
		return false
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		infos.RespHeader[key] = strings.Join(values, "|")
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	bodyBytes, err = io.ReadAll(resp.Body)
	if err != nil {
		logs.Error("测试 uri 执行异常: %v", err)
		return false
	}
	infos.RespBody = string(bodyBytes)
	infos.RespStatus = resp.StatusCode
	logs.Warn("测试 uri 代理信息: %s", jsons.FromValue(infos))

	c.Status(infos.RespStatus)
	c.Writer.Write(bodyBytes)

	return true
}

// ProxyRoot web 首页代理
func ProxyRoot(c *gin.Context) {
	resp, err := https.Request(c.Request.Method, config.C.Emby.Host+c.Request.URL.String()).
		Header(c.Request.Header).
		Body(c.Request.Body).
		DoSingle()

	if checkErr(c, err) {
		return
	}
	defer resp.Body.Close()

	https.CloneHeader(c.Writer, resp.Header)
	c.Status(resp.StatusCode)

	buf := bytess.CommonFixedBuffer()
	defer buf.PutBack()
	io.CopyBuffer(c.Writer, resp.Body, buf.Bytes())
}

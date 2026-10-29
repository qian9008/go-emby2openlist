package https

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/web/webproxy"
)

const (

	// MaxRedirectDepth 重定向的最大深度
	MaxRedirectDepth = 10
)

var client *http.Client

// RedirectCodes 有重定向含义的 http 响应码
var RedirectCodes = [4]int{http.StatusMovedPermanently, http.StatusFound, http.StatusTemporaryRedirect, http.StatusPermanentRedirect}

func init() {
	client = &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
			// 建立连接 1 分钟超时
			Dial: (&net.Dialer{Timeout: time.Minute}).Dial,
			// 接收数据 5 分钟超时
			ResponseHeaderTimeout: time.Minute * 5,
			// 网络代理
			Proxy: func(r *http.Request) (*url.URL, error) {
				if r.URL.Scheme == "http" && webproxy.HttpUrl != nil {
					return webproxy.HttpUrl, nil
				}
				if r.URL.Scheme == "https" && webproxy.HttpsUrl != nil {
					return webproxy.HttpsUrl, nil
				}
				return nil, nil
			},
		},
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// IsRedirectCode 判断 http code 是否是重定向
//
// 301, 302, 307, 308
func IsRedirectCode(code int) bool {
	for _, valid := range RedirectCodes {
		if code == valid {
			return true
		}
	}
	return false
}

// IsSuccessCode 判断 http code 是否为成功状态
func IsSuccessCode(code int) bool {
	codeStr := strconv.Itoa(code)
	return strings.HasPrefix(codeStr, "2")
}

// IsErrorCode 判断 http code 是否为错误状态
func IsErrorCode(code int) bool {
	codeStr := strconv.Itoa(code)
	return strings.HasPrefix(codeStr, "4") || strings.HasPrefix(codeStr, "5")
}

// EmbyAuthHeaderValue 返回兼容 Emby 与 Jellyfin(含 12.x) 的鉴权头值。
//
// Jellyfin 12.0+ 默认禁用了旧版鉴权方式（?api_key= 查询参数、X-Emby-Token 头、/emby/ 前缀），
// 仅认 Authorization: MediaBrowser Token="..." 头与 ?ApiKey= 查询参数。
// 而 Emby 全系仍兼容该 MediaBrowser 头。因此统一用它附加到 ge2o 出站/代理请求上，
// 旧方式（api_key / X-Emby-Token）一律保留，确保 Emby 不回归。
func EmbyAuthHeaderValue(apiKey string) string {
	if apiKey == "" {
		return ""
	}
	return fmt.Sprintf(`MediaBrowser Token="%s"`, apiKey)
}

// ExtractEmbyToken 从请求中提取 Emby/Jellyfin 鉴权令牌，兼容多种历史传递方式：
// query(api_key/token) → 头(X-Emby-Token/X-MediaBrowser-Token) → Authorization/X-Emby-Authorization 中的 Token。
// 用于代理转发时把生效令牌镜像成 Jellyfin 12 认的 MediaBrowser 头。
func ExtractEmbyToken(r *http.Request) string {
	if r == nil {
		return ""
	}
	q := r.URL.Query()
	for _, k := range []string{"api_key", "token"} {
		if v := q.Get(k); v != "" {
			return v
		}
	}
	for _, h := range []string{"X-Emby-Token", "X-MediaBrowser-Token"} {
		if v := r.Header.Get(h); v != "" {
			return v
		}
	}
	for _, h := range []string{"Authorization", "X-Emby-Authorization"} {
		if v := r.Header.Get(h); v != "" {
			if idx := strings.Index(v, `Token="`); idx != -1 {
				t := v[idx+len(`Token="`):]
				if end := strings.Index(t, `"`); end != -1 {
					return t[:end]
				}
				return t
			}
			if idx := strings.Index(v, "Token="); idx != -1 {
				return v[idx+len("Token="):]
			}
		}
	}
	return ""
}

// MapBody 将 map 转换为 ReadCloser 流
func MapBody(body map[string]any) io.ReadCloser {
	if body == nil {
		return nil
	}
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		log.Printf("MapBody 转换失败, body: %v, err : %v", body, err)
		return nil
	}
	return io.NopCloser(bytes.NewBuffer(bodyBytes))
}

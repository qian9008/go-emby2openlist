package share_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/emby"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/share"
	"github.com/gin-gonic/gin"
)

// TestShareIntegration 集成测试: 验证无权用户 B 访问分享视频时的权限穿透与提权
func TestShareIntegration(t *testing.T) {
	gin.SetMode(gin.TestMode)

	// 记录 Mock Emby 服务器收到的请求，以便验证是否使用了正确的 ApiKey 提权
	receivedRequests := make(chan string, 10)

	// 1. 建立 Mock Emby 服务端
	mockEmby := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiKey := r.URL.Query().Get("api_key")
		if apiKey == "" {
			apiKey = r.Header.Get("X-Emby-Token")
		}

		println("Mock Emby 收到请求:", r.Method, r.URL.Path, "api_key:", apiKey)
		receivedRequests <- r.Method + " " + r.URL.Path + "?api_key=" + apiKey

		// A. 身份校验接口
		if r.URL.Path == "/emby/Users/Me" {
			if apiKey == "key_admin" {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"Id": "admin_user_id", "Name": "Admin"}`))
				return
			}
			if apiKey == "key_user_b" {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"Id": "user_b_id", "Name": "UserB"}`))
				return
			}
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		// B. 查询用户列表接口 (用于初始化等场景)
		if r.URL.Path == "/emby/Users" {
			if apiKey == "key_admin" {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`[{"Id": "admin_user_id", "Name": "Admin"},{"Id": "user_b_id", "Name": "UserB"}]`))
				return
			}
			w.WriteHeader(http.StatusForbidden)
			return
		}

		// C. PlaybackInfo 接口 (先于详情页判定，避免包含子路径冲突)
		if strings.Contains(r.URL.Path, "/PlaybackInfo") {
			if apiKey == "key_user_b" {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			if apiKey == "key_admin" {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"MediaSources":[{"Id":"item_shared","Path":"/mnt/shared_movie.mp4","Name":"Shared Movie"}]}`))
				return
			}
		}

		// D. 视频详情接口 (原生 Emby 端)
		if strings.Contains(r.URL.Path, "/Items/item_shared") {
			// 如果是普通用户 B 查详情, 且没带管理 key, 拒绝
			if apiKey == "key_user_b" {
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"Message": "Access denied"}`))
				return
			}
			// 管理员 Key 有权访问
			if apiKey == "key_admin" {
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"Id": "item_shared", "Name": "Shared Movie", "Type": "Movie", "Path": "/mnt/shared_movie.mp4"}`))
				return
			}
		}

		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockEmby.Close()

	// 2. 初始化全局配置
	tempDir, err := os.MkdirTemp("", "ge2o-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	config.BasePath = tempDir
	config.C = &config.Config{
		Emby: &config.Emby{
			Host:        mockEmby.URL,
			AdminApiKey: "key_admin",
		},
		VideoPreview: &config.VideoPreview{
			Enable: false,
		},
		Cache: &config.Cache{
			Enable: false,
		},
		Ssl: &config.Ssl{
			Enable: false,
		},
	}

	// 初始化/清空 shares.json
	share.Init()

	// 3. 构造 A 分享给 B 的数据关系
	owner := share.EmbyUser{Id: "admin_user_id", Name: "Admin"}
	target := share.EmbyUser{Id: "user_b_id", Name: "UserB"}
	share.CreateShares("item_shared", owner, []share.EmbyUser{target})

	// 验证分享成功建立
	if !share.IsSharedTo("item_shared", "user_b_id") {
		t.Fatalf("expected item_shared to be shared to user_b_id")
	}

	// ==========================================
	// 测试场景 1: B 用户查询详情 (LoadCacheItems)
	// ==========================================
	t.Run("QueryDetails_B_User_穿透代查询", func(t *testing.T) {
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)

		// 模拟 B 用户用自己的 token 发送请求
		req, _ := http.NewRequest("GET", "/emby/Users/user_b_id/Items/item_shared", nil)
		req.Header.Set("X-Emby-Token", "key_user_b")
		c.Request = req

		// 触发拦截处理器
		emby.LoadCacheItems(c)

		// 判定结果：应该成功返回了 200 (由管理员代发成功)
		if rec.Code != http.StatusOK {
			t.Errorf("expected status 200, got %d, body: %s", rec.Code, rec.Body.String())
		}

		var bodyMap map[string]interface{}
		if err := json.Unmarshal(rec.Body.Bytes(), &bodyMap); err != nil {
			t.Fatalf("failed to unmarshal details response: %v", err)
		}

		if bodyMap["Id"] != "item_shared" || bodyMap["Name"] != "Shared Movie" {
			t.Errorf("unexpected details returned: %v", bodyMap)
		}

		// 验证 Mock Emby 服务器收到了来自管理员身份的请求
		expectedReqMsg := "GET /emby/Items/item_shared?api_key=key_admin"
		found := false
		for attempt := 0; attempt < 20; attempt++ {
			select {
			case msg := <-receivedRequests:
				if strings.Contains(msg, expectedReqMsg) {
					found = true
					break
				}
			default:
				time.Sleep(10 * time.Millisecond)
			}
		}
		if !found {
			t.Errorf("Mock Emby did not receive the expected admin request: %s", expectedReqMsg)
		}
	})

	// ==========================================
	// 测试场景 2: B 用户请求播放 PlaybackInfo (TransferPlaybackInfo)
	// ==========================================
	t.Run("PlaybackInfo_B_User_自动提权", func(t *testing.T) {
		// 清空通道
		for len(receivedRequests) > 0 {
			<-receivedRequests
		}

		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)

		// 模拟 B 用户用自己 token 请求 PlaybackInfo
		req, _ := http.NewRequest("POST", "/emby/Items/item_shared/PlaybackInfo?api_key=key_user_b", io.NopCloser(strings.NewReader("{}")))
		c.Request = req

		// 触发处理器
		emby.TransferPlaybackInfo(c)

		if rec.Code != http.StatusOK {
			t.Errorf("expected PlaybackInfo status 200, got %d, body: %s", rec.Code, rec.Body.String())
		}

		// 校验后台向 Mock Emby 发起的 PlaybackInfo 请求，其 api_key 必须升级提权为 key_admin
		expectedReqMsg := "POST /Items/item_shared/PlaybackInfo?api_key=key_admin"
		found := false
		for attempt := 0; attempt < 20; attempt++ {
			select {
			case msg := <-receivedRequests:
				if strings.Contains(msg, expectedReqMsg) {
					found = true
					break
				}
			default:
				time.Sleep(10 * time.Millisecond)
			}
		}
		if !found {
			t.Errorf("Mock Emby did not receive the expected PlaybackInfo admin request: %s", expectedReqMsg)
		}
	})
}

package share

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/https"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"

	"github.com/gin-gonic/gin"
)

// ShareItem 分享关系记录
type ShareItem struct {
	// Id 分享记录唯一标识 (自增)
	Id int64 `json:"id"`
	// MediaId 被分享的 Emby Item ID
	MediaId string `json:"media_id"`
	// OwnerUserId 分享发起者的 Emby UserId
	OwnerUserId string `json:"owner_user_id"`
	// OwnerUsername 分享发起者的用户名 (冗余, 用于展示)
	OwnerUsername string `json:"owner_username"`
	// TargetUserId 被分享目标用户的 Emby UserId
	TargetUserId string `json:"target_user_id"`
	// TargetUsername 被分享目标用户的用户名 (冗余, 用于展示)
	TargetUsername string `json:"target_username"`
	// CreatedAt 创建时间
	CreatedAt string `json:"created_at"`
	// ExpireAt 过期时间, 空字符串表示永不过期
	ExpireAt string `json:"expire_at"`
	// Status 状态: 1=有效, 0=已取消
	Status int `json:"status"`
}

// EmbyUser Emby 用户基础信息
type EmbyUser struct {
	Id   string `json:"Id"`
	Name string `json:"Name"`
}

// store 内存分享数据存储, 受 mu 读写锁保护
var store struct {
	mu     sync.RWMutex
	items  []ShareItem
	nextId int64
}

// dataFilePath 返回 shares.json 的绝对路径
func dataFilePath() string {
	return filepath.Join(config.BasePath, "shares.json")
}

// Init 从磁盘加载分享数据到内存, 在程序启动时调用
func Init() {
	store.mu.Lock()
	defer store.mu.Unlock()

	fp := dataFilePath()
	bytes, err := os.ReadFile(fp)
	if err != nil {
		// 文件不存在时使用空数据, 不报错
		store.items = []ShareItem{}
		store.nextId = 1
		logs.Info("分享数据文件不存在, 将使用空数据: %s", fp)
		return
	}

	if err := json.Unmarshal(bytes, &store.items); err != nil {
		logs.Error("解析分享数据文件失败: %v, 将使用空数据", err)
		store.items = []ShareItem{}
		store.nextId = 1
		return
	}

	// 计算下一个自增 ID
	var maxId int64
	for _, item := range store.items {
		if item.Id > maxId {
			maxId = item.Id
		}
	}
	store.nextId = maxId + 1
	logs.Success("已加载 %d 条分享记录", len(store.items))
}

// flush 将内存数据写入磁盘 (调用前须持有写锁)
func flush() {
	bytes, err := json.MarshalIndent(store.items, "", "  ")
	if err != nil {
		logs.Error("序列化分享数据失败: %v", err)
		return
	}
	if err := os.WriteFile(dataFilePath(), bytes, 0644); err != nil {
		logs.Error("写入分享数据文件失败: %v", err)
	}
}

// CreateShares 批量创建分享记录
// 如果同一条 (media_id, owner, target) 关系已存在且有效, 则跳过
func CreateShares(mediaId string, owner EmbyUser, targets []EmbyUser) int {
	store.mu.Lock()
	defer store.mu.Unlock()

	created := 0
	now := time.Now().Format("2006-01-02 15:04:05")
	for _, target := range targets {
		// 去重: 检查是否已存在有效的相同分享关系
		exists := false
		for _, existing := range store.items {
			if existing.MediaId == mediaId &&
				existing.OwnerUserId == owner.Id &&
				existing.TargetUserId == target.Id &&
				existing.Status == 1 {
				exists = true
				break
			}
		}
		if exists {
			continue
		}

		store.items = append(store.items, ShareItem{
			Id:             store.nextId,
			MediaId:        mediaId,
			OwnerUserId:    owner.Id,
			OwnerUsername:   owner.Name,
			TargetUserId:   target.Id,
			TargetUsername:  target.Name,
			CreatedAt:      now,
			ExpireAt:       "",
			Status:         1,
		})
		store.nextId++
		created++
	}

	if created > 0 {
		flush()
	}
	return created
}

// GetSharesByOwner 获取指定用户发起的所有有效分享, 支持分页
func GetSharesByOwner(ownerUserId string, startIndex, limit int) ([]ShareItem, int) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	var matched []ShareItem
	for _, item := range store.items {
		if item.OwnerUserId == ownerUserId && item.Status == 1 {
			matched = append(matched, item)
		}
	}

	total := len(matched)
	if startIndex >= total {
		return []ShareItem{}, total
	}
	end := startIndex + limit
	if end > total {
		end = total
	}
	return matched[startIndex:end], total
}

// GetSharesForTarget 获取分享给指定用户的所有有效分享记录, 支持分页
func GetSharesForTarget(targetUserId string, startIndex, limit int) ([]ShareItem, int) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	var matched []ShareItem
	for _, item := range store.items {
		if item.TargetUserId == targetUserId && item.Status == 1 {
			matched = append(matched, item)
		}
	}

	total := len(matched)
	if startIndex >= total {
		return []ShareItem{}, total
	}
	end := startIndex + limit
	if end > total {
		end = total
	}
	return matched[startIndex:end], total
}

// GetShareById 按 ID 获取单条分享记录
func GetShareById(id int64) (ShareItem, bool) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	for _, item := range store.items {
		if item.Id == id {
			return item, true
		}
	}
	return ShareItem{}, false
}

// DeleteShare 取消分享 (软删除: 将 status 设为 0)
// 只有分享的 owner 才有权取消
func DeleteShare(id int64, operatorUserId string) error {
	store.mu.Lock()
	defer store.mu.Unlock()

	for i := range store.items {
		if store.items[i].Id == id {
			if store.items[i].OwnerUserId != operatorUserId {
				return fmt.Errorf("无权操作: 只有分享发起者可以取消分享")
			}
			store.items[i].Status = 0
			flush()
			return nil
		}
	}
	return fmt.Errorf("分享记录不存在: %d", id)
}

// IsSharedTo 检查指定的 mediaId 是否被分享给了 targetUserId
func IsSharedTo(mediaId, targetUserId string) bool {
	store.mu.RLock()
	defer store.mu.RUnlock()

	for _, item := range store.items {
		if item.MediaId == mediaId && item.TargetUserId == targetUserId && item.Status == 1 {
			return true
		}
	}
	return false
}

// ---- Emby 辅助方法 ----

// getRequestApiKey 解析请求中的 api_key 或 token，避免依赖 emby 模块
func getRequestApiKey(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if k := c.Query("api_key"); k != "" {
		return k
	}
	if k := c.Query("token"); k != "" {
		return k
	}
	if k := c.GetHeader("X-Emby-Token"); k != "" {
		return k
	}
	if k := c.GetHeader("X-MediaBrowser-Token"); k != "" {
		return k
	}
	if auth := c.GetHeader("Authorization"); auth != "" {
		for _, part := range []string{"Token=\"", "Token="} {
			if idx := strings.Index(auth, part); idx != -1 {
				token := auth[idx+len(part):]
				if endIdx := strings.Index(token, "\""); endIdx != -1 {
					return token[:endIdx]
				}
				return token
			}
		}
	}
	return ""
}

// GetCurrentUser 通过请求中的 API Key 向 Emby 查询当前用户身份
func GetCurrentUser(c *gin.Context) (EmbyUser, error) {
	apiKey := getRequestApiKey(c)
	if apiKey == "" {
		return EmbyUser{}, fmt.Errorf("请求中未携带有效的 API Key")
	}

	// 调用 Emby 的 /Users/Me 或 /emby/Users/Me 接口获取当前用户信息
	url := config.C.Emby.Host + "/emby/Users/Me?api_key=" + apiKey
	resp, err := https.Get(url).Do()
	if err != nil {
		return EmbyUser{}, fmt.Errorf("查询 Emby 用户信息失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return EmbyUser{}, fmt.Errorf("Emby 返回非 200 响应: %s", resp.Status)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return EmbyUser{}, fmt.Errorf("读取 Emby 用户响应失败: %v", err)
	}

	var user EmbyUser
	if err := json.Unmarshal(bodyBytes, &user); err != nil {
		return EmbyUser{}, fmt.Errorf("解析 Emby 用户响应失败: %v", err)
	}

	if user.Id == "" {
		return EmbyUser{}, fmt.Errorf("解析的用户 ID 为空")
	}

	return user, nil
}

// GetAllEmbyUsers 获取 Emby 系统中的所有用户 (需要 admin-api-key)
func GetAllEmbyUsers() ([]EmbyUser, error) {
	adminKey := config.C.Emby.AdminApiKey
	if adminKey == "" {
		return nil, fmt.Errorf("未配置 emby.admin-api-key, 无法获取用户列表")
	}

	url := config.C.Emby.Host + "/emby/Users?api_key=" + adminKey
	resp, err := https.Get(url).Do()
	if err != nil {
		return nil, fmt.Errorf("查询 Emby 用户列表失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Emby 返回非 200 响应: %s", resp.Status)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取 Emby 用户列表响应失败: %v", err)
	}

	var users []EmbyUser
	if err := json.Unmarshal(bodyBytes, &users); err != nil {
		return nil, fmt.Errorf("解析 Emby 用户列表失败: %v", err)
	}

	return users, nil
}

// GetItemInfoByAdmin 使用管理员 API Key 获取 Emby 媒体元数据 (跨权限)
// 返回原始 JSON 字节, 由调用方自行处理
func GetItemInfoByAdmin(itemId string) (json.RawMessage, error) {
	adminKey := config.C.Emby.AdminApiKey
	if adminKey == "" {
		return nil, fmt.Errorf("未配置 emby.admin-api-key")
	}

	url := config.C.Emby.Host + "/emby/Items/" + itemId + "?api_key=" + adminKey
	resp, err := https.Get(url).Do()
	if err != nil {
		return nil, fmt.Errorf("查询 Emby 媒体信息失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Emby 返回非 200 响应: %s", resp.Status)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取 Emby 媒体信息失败: %v", err)
	}
	return json.RawMessage(bodyBytes), nil
}

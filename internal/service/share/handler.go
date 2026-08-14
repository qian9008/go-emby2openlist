package share

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/constant"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"

	"github.com/gin-gonic/gin"
)

// ---- 请求/响应结构体 ----

// CreateShareRequest 创建分享的请求体
type CreateShareRequest struct {
	MediaId string   `json:"media_id"` // Emby Item ID
	Targets []string `json:"targets"`  // 目标用户 ID 列表
}

// PagedResponse 对齐 Emby 风格的分页响应
type PagedResponse struct {
	TotalRecordCount int         `json:"TotalRecordCount"`
	Items            interface{} `json:"Items"`
}

// SimpleResponse 简单操作结果响应
type SimpleResponse struct {
	Success bool   `json:"success"`
	Msg     string `json:"msg"`
}

// ---- API 处理器 ----

// HandleGetUsers 获取可分享的用户列表 (排除自己)
// GET /api/share/users
func HandleGetUsers(c *gin.Context) {
	currentUser, err := GetCurrentUser(c)
	if err != nil {
		logs.Error("获取当前用户失败: %v", err)
		c.JSON(http.StatusUnauthorized, SimpleResponse{false, "身份验证失败"})
		return
	}

	allUsers, err := GetAllEmbyUsers()
	if err != nil {
		logs.Error("获取 Emby 用户列表失败: %v", err)
		c.JSON(http.StatusInternalServerError, SimpleResponse{false, "获取用户列表失败"})
		return
	}

	// 过滤掉当前用户自己 (进行不区分大小写比对，以防格式偏差)
	var result []EmbyUser
	for _, u := range allUsers {
		if strings.ToLower(u.Id) != strings.ToLower(currentUser.Id) {
			result = append(result, u)
		}
	}
	if result == nil {
		result = []EmbyUser{}
	}

	c.JSON(http.StatusOK, result)
}

// HandleCreateShare 创建视频分享
// POST /api/share/create
func HandleCreateShare(c *gin.Context) {
	currentUser, err := GetCurrentUser(c)
	if err != nil {
		logs.Error("获取当前用户失败: %v", err)
		c.JSON(http.StatusUnauthorized, SimpleResponse{false, "身份验证失败"})
		return
	}

	var req CreateShareRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, SimpleResponse{false, "请求参数格式错误"})
		return
	}

	if req.MediaId == "" || len(req.Targets) == 0 {
		c.JSON(http.StatusBadRequest, SimpleResponse{false, "media_id 和 targets 不能为空"})
		return
	}

	// 获取所有用户信息, 用于填充目标用户名
	allUsers, err := GetAllEmbyUsers()
	if err != nil {
		logs.Error("获取 Emby 用户列表失败: %v", err)
		c.JSON(http.StatusInternalServerError, SimpleResponse{false, "获取用户列表失败"})
		return
	}
	userMap := make(map[string]EmbyUser)
	for _, u := range allUsers {
		userMap[u.Id] = u
	}

	// 构造目标用户列表
	var targets []EmbyUser
	for _, targetId := range req.Targets {
		if u, ok := userMap[targetId]; ok {
			targets = append(targets, u)
		}
	}

	if len(targets) == 0 {
		c.JSON(http.StatusBadRequest, SimpleResponse{false, "未找到有效的目标用户"})
		return
	}

	created := CreateShares(req.MediaId, currentUser, targets)
	logs.Success("用户 %s 创建了 %d 条分享记录 (media_id=%s)", currentUser.Name, created, req.MediaId)
	c.JSON(http.StatusOK, SimpleResponse{true, "分享成功，已创建 " + strconv.Itoa(created) + " 条共享记录"})
}

// HandleGetMine 获取我发起的分享 (分页)
// GET /api/share/mine?StartIndex=0&Limit=20
func HandleGetMine(c *gin.Context) {
	currentUser, err := GetCurrentUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, SimpleResponse{false, "身份验证失败"})
		return
	}

	startIndex := parseIntParam(c, "StartIndex", 0)
	limit := parseIntParam(c, "Limit", 20)

	items, total := GetSharesByOwner(currentUser.Id, startIndex, limit)

	// 填充媒体名称: 使用 admin key 批量查询
	enrichedItems := make([]ShareItemWithMediaName, 0, len(items))
	for _, item := range items {
		enrichedItems = append(enrichedItems, ShareItemWithMediaName{
			ShareItem: item,
			MediaName: fetchMediaName(item.MediaId),
		})
	}

	c.JSON(http.StatusOK, PagedResponse{
		TotalRecordCount: total,
		Items:            enrichedItems,
	})
}

// HandleGetSharedWithMe 获取共享给我的视频 (分页)
// 返回对齐 Emby BaseItemDto 格式的元数据, 前端可直接渲染海报墙
// GET /api/share/shared-with-me?StartIndex=0&Limit=20
func HandleGetSharedWithMe(c *gin.Context) {
	currentUser, err := GetCurrentUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, SimpleResponse{false, "身份验证失败"})
		return
	}

	startIndex := parseIntParam(c, "StartIndex", 0)
	limit := parseIntParam(c, "Limit", 20)

	shares, total := GetSharesForTarget(currentUser.Id, startIndex, limit)

	// 使用 admin key 批量查询每个 mediaId 对应的 Emby 元数据
	var resultItems []json.RawMessage
	for _, share := range shares {
		itemInfo, err := GetItemInfoByAdmin(share.MediaId)
		if err != nil {
			logs.Warn("获取共享媒体元数据失败 (media_id=%s): %v", share.MediaId, err)
			continue
		}

		// 在原始 JSON 中注入 ShareOwnerName 扩展字段
		enriched := injectShareOwnerName(itemInfo, share.OwnerUsername)
		resultItems = append(resultItems, enriched)
	}

	if resultItems == nil {
		resultItems = []json.RawMessage{}
	}

	c.JSON(http.StatusOK, PagedResponse{
		TotalRecordCount: total,
		Items:            resultItems,
	})
}

// HandleDeleteShare 取消分享
// DELETE /api/share/:id
func HandleDeleteShare(c *gin.Context) {
	currentUser, err := GetCurrentUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, SimpleResponse{false, "身份验证失败"})
		return
	}

	idStr := extractIdFromSubMatch(c)
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, SimpleResponse{false, "无效的分享 ID"})
		return
	}

	if err := DeleteShare(id, currentUser.Id); err != nil {
		c.JSON(http.StatusForbidden, SimpleResponse{false, err.Error()})
		return
	}

	logs.Info("用户 %s 取消了分享记录 ID=%d", currentUser.Name, id)
	c.JSON(http.StatusOK, SimpleResponse{true, "分享已取消"})
}

// HandleGetShareDetail 查询分享详情
// GET /api/share/:id
func HandleGetShareDetail(c *gin.Context) {
	idStr := extractIdFromSubMatch(c)
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, SimpleResponse{false, "无效的分享 ID"})
		return
	}

	item, ok := GetShareById(id)
	if !ok {
		c.JSON(http.StatusNotFound, SimpleResponse{false, "分享记录不存在"})
		return
	}

	c.JSON(http.StatusOK, item)
}

// ---- 工具方法 ----

// parseIntParam 从 Query 参数中解析整数, 解析失败返回默认值
func parseIntParam(c *gin.Context, key string, defaultVal int) int {
	val := c.Query(key)
	if val == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(val)
	if err != nil || n < 0 {
		return defaultVal
	}
	return n
}

// ShareItemWithMediaName 带媒体名称的分享条目 (用于"我的分享"列表)
type ShareItemWithMediaName struct {
	ShareItem
	MediaName string `json:"media_name"`
}

// extractIdFromSubMatch 从正则路由子匹配中提取 ID 参数
// 项目使用自定义正则路由系统, 参数不在 c.Param 中, 而在 RouteSubMatchGinKey 上下文中
func extractIdFromSubMatch(c *gin.Context) string {
	val, exists := c.Get(constant.RouteSubMatchGinKey)
	if !exists {
		return ""
	}
	matches, ok := val.([]string)
	if !ok || len(matches) < 2 {
		return ""
	}
	// matches[0] 是完整匹配, matches[1] 是第一个捕获组 (即 ID)
	return matches[1]
}

// fetchMediaName 使用 admin key 获取单个媒体的名称 (优先提取 Path 中的文件名)
func fetchMediaName(mediaId string) string {
	itemInfo, err := GetItemInfoByAdmin(mediaId)
	if err != nil {
		return ""
	}
	var parsed struct {
		Name string `json:"Name"`
		Path string `json:"Path"`
	}
	if err := json.Unmarshal(itemInfo, &parsed); err != nil {
		return ""
	}
	if parsed.Path != "" {
		// 兼容 Windows 和 Linux 的路径分隔符，提取文件名
		slashIdx := strings.LastIndex(parsed.Path, "/")
		backslashIdx := strings.LastIndex(parsed.Path, "\\")
		idx := slashIdx
		if backslashIdx > idx {
			idx = backslashIdx
		}
		if idx != -1 && idx < len(parsed.Path)-1 {
			return parsed.Path[idx+1:]
		}
		return parsed.Path
	}
	return parsed.Name
}

// injectShareOwnerName 在 Emby Item JSON 中注入 ShareOwnerName 字段
func injectShareOwnerName(raw json.RawMessage, ownerName string) json.RawMessage {
	s := strings.TrimSpace(string(raw))
	if len(s) < 2 || s[0] != '{' {
		return raw
	}
	// 在第一个 '{' 后面注入字段
	injected := `{"ShareOwnerName":"` + ownerName + `",` + s[1:]
	return json.RawMessage(injected)
}

// HandleGetDebugLogs 读取并返回调试日志内容
// GET /api/share/debug-logs
func HandleGetDebugLogs(c *gin.Context) {
	DebugLogsMu.Lock()
	defer DebugLogsMu.Unlock()

	logStr := strings.Join(DebugLogs, "\n")
	c.String(http.StatusOK, logStr)
}

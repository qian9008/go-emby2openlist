# 私有视频空间分享系统后端拦截与权限穿透设计方案

为了让无权限的被分享用户 B 能够像原生库一样获取分享视频的目录、查看视频详情并流畅播放，我们需要在 Go 后端反代拦截中实现**管理员权限穿透代请求**。

## 1. 循环依赖（Import Cycle）架构优化

目前 `internal/service/share` 引入了 `internal/service/emby`（调用其 `ExportGetApiKey`），如果 `emby` 再引入 `share` 以判断某个资源是否被分享，将直接导致 Go 语言的编译期循环依赖报错。

### 优化方案：
1. **解耦 `share` 对 `emby` 的依赖**：在 `share/share.go` 中自行实现轻量级 API Key 解析 `getRequestApiKey(c)`，完全剥离对 `emby` 模块的引用。
2. **安全引入**：在此之后，`emby` 包即可安全地引入 `share` 包，执行权限校验和越权拦截。

---

## 2. 核心拦截与穿透点设计

### 2.1 详情获取拦截 (Items 接口)
* **拦截点**：`internal/service/emby/playbackinfo.go` 中的 `LoadCacheItems` 处理器（对应路由 `/users/:userId/items/:itemId`）。
* **逻辑**：
  1. 判断当前请求的 `itemId` 是否已被分享给当前登录的请求用户。
  2. 若已分享，则使用管理员密钥通过 `share.GetItemInfoByAdmin(itemId)` 跨权限拉取该视频元数据，并将包含 `ShareOwnerName` 扩展字段的 JSON 详情直接返回给客户端，不再向 Emby 转发原请求。

### 2.2 播放信息拦截 (PlaybackInfo 接口)
* **拦截点**：`internal/service/emby/media.go` 中的 `resolveItemInfo` 通用解析器。
* **逻辑**：
  1. 在 `resolveItemInfo` 执行末尾，判断请求的 `itemId` 是否已被分享给当前用户。
  2. 若已分享，则**将 `itemInfo.ApiKey` 自动提权修改为配置中的 `AdminApiKey`**。
  3. 临时重写请求上下文的 Query 与 Header 中的 `api_key` 与 `X-Emby-Token` 为管理员 Key，使得后续所有的 Emby 数据代请求、以及 PlaybackInfo 响应里的下载/串流地址均能以管理员权限顺利获取物理地址并完成直链重定向。

---

## 3. 拟修改文件

### [MODIFY] [share.go](file:///d:/Users/Documents/1/emby2openlist/internal/service/share/share.go)
* 移除对 `github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/emby` 的导入。
* 自行实现 `getRequestApiKey` 替代原有的 `emby.ExportGetApiKey`。

### [MODIFY] [media.go](file:///d:/Users/Documents/1/emby2openlist/internal/service/emby/media.go)
* 导入 `github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/share`。
* 在 `resolveItemInfo` 尾部，注入分享权限识别与 `AdminApiKey` 自动替换提权逻辑。

### [MODIFY] [playbackinfo.go](file:///d:/Users/Documents/1/emby2openlist/internal/service/emby/playbackinfo.go)
* 在 `LoadCacheItems` 开头拦截已被分享的 Item 详情请求，并直接用管理员权限查出元数据返回。

---

## 4. 自动化单元/集成测试计划

为高保真观测和验证“A用户分享电影给无权用户B，B能够获取和播放”这一逻辑，我们将编写集成测试脚本：
1. **测试脚本**：[test_share_integration.go](file:///d:/Users/Documents/1/emby2openlist/internal/service/share/test_share_integration.go) 或 Go 测试文件。
2. **测试逻辑**：
   * Mock 一个分享关系：将 `MediaId = "test_media_123"` 归属设为用户 A (`owner_user_id = "user_a"`)，分享给无权用户 B (`target_user_id = "user_b"`)。
   * 以用户 B 的身份（使用 Mock B 的 ApiKey）发起 Items 详情请求，验证是否返回正确的元数据。
   * 以用户 B 的身份发起 PlaybackInfo 请求，验证是否能成功提权并获取播放流直链。

# 私有视频空间分享系统集成实施计划 (Go 后端部分)

本项目标是在 `go-emby2openlist` 反代后端中集成 [prd.md](file:///d:/Users/Documents/1/emby2openlist/prd.md) 描述的“私有视频空间分享系统”后端逻辑。通过本项集成，能让用户对单文件视频进行定向分享，且完全在不修改 Jellyfin 数据库、不重扫媒体库的前提下实现多用户安全直链共享。

---

## 1. 架构设计与技术决策

### 1.1 轻量级持久化方案
* **选型**：使用线程安全（基于 `sync.RWMutex` 锁定）的 **本地 JSON 文件存储 (`shares.json`)** 作为持久化数据库。
* **原因**：本项目为单机个人/家庭私有应用，数据量通常在千条以内。使用 JSON 文件可以做到**纯 Go 零依赖、无需引入编译期带 CGO 依赖的关系型数据库驱动**（如 `github.com/mattn/go-sqlite3`），确保了极高的高移植性与跨平台稳定性。

### 1.2 Jellyfin 用户身份提取
* **方法**：Go 后端在拦截 `/api/share/*` 系列接口时，提取请求头或参数中的 API Key（通过已有的 `getApiKey` 工具）。
* **接口调用**：通过获取到的 API Key 异步调用 Emby/Jellyfin 官方接口 `/Users/Me`（或 `/emby/Users/Me`），从中解析出当前操作用户的 `Id` (UserID) 和 `Name` (UserName) 进行权限比对与归档，实现天然的身份绑定。

### 1.3 管理员 API Key 与跨权限直链重定向
* **安全要求**：由于被分享的用户 B 对原视频所处的 Emby 媒体库可能没有任何访问权限（甚至看不到该视频），所以客户端在以用户 B 的身份请求播放时会触发鉴权失败。
* **解决办法**：
  1. 在 `config.yml` 配置文件中新增 `emby.admin-api-key` (管理员 API 密钥)。
  2. 当收到用户 B 播放被分享的 `media_id` (即 Emby ItemId) 的请求时，Go 反代后端验证 `shares.json` 中的分享关系合法性。
  3. 验证通过后，Go 反代后端**使用配置的 Admin API Key 代替用户 B 的 API Key** 去请求 Emby 服务端获取该视频的物理存储路径（`Path`），并用 OpenList 解析直链响应 302 重定向给客户端。

---

## 2. 拟修改与新增文件列表

### [Component: 核心配置]
#### [MODIFY] [config.go](file:///d:/Users/Documents/1/emby2openlist/internal/config/config.go)
* 在配置结构体中新增 `AdminApiKey` 配置字段：
  ```go
  type EmbyConfig struct {
      Host           string `yaml:"host"`
      AdminApiKey    string `yaml:"admin-api-key"` // 管理员密钥
      // ...其他现有字段
  }
  ```

### [Component: 分享存储与逻辑层]
#### [NEW] [share.go](file:///d:/Users/Documents/1/emby2openlist/internal/service/emby/share.go)
* 定义分享关系的数据结构体 `ShareItem`（对应 PRD 数据字典）。
* 实现基于内存 RWMutex 加锁的增删改查逻辑，并在写操作时自动写回 `shares.json` 磁盘文件。
* 封装调用 Emby `/Users/Me` 获取当前操作用户详细信息的 `getCurrentUser(c *gin.Context)` 工具方法。
* 封装调用 Emby 接口验证某媒体是否存在、获取所有用户列表（用于前端分享选择）等辅助 API。

### [Component: API 路由与拦截器]
#### [NEW] [share_handler.go](file:///d:/Users/Documents/1/emby2openlist/internal/web/share_handler.go)
* 实现 PRD 规定的 5 个核心 RESTful API 处理器：
  - `POST /api/share/create`：创建分享关系。
  - `GET /api/share/mine`：获取当前用户发起的分享。
  - `GET /api/share/shared-with-me`：获取分享给当前用户的媒体列表。
  - `DELETE /api/share/:id`：取消分享。
  - `GET /api/share/:id`：查询分享详情。
  - `GET /api/share/users`：获取系统内所有的 Emby 用户列表（过滤掉当前用户自身），供前端弹窗选择。

#### [MODIFY] [route.go](file:///d:/Users/Documents/1/emby2openlist/internal/web/route.go)
* 在路由拦截规则 `rules` 中注册新增的 `/api/share/*` 路由。
* 在播放流拦截器逻辑中，整合分享权限检测：如果当前请求的用户不是视频所有者，但属于被分享的目标用户，则调用管理员权限获取物理路径并重定向至直链。

---

## 3. 验证计划

### 3.1 单元测试与接口验证
* 使用 Go test 验证 `share.go` 存储引擎的并发读写 and JSON 自动持久化功能。
* 使用 Mock HTTP 请求调用 `/api/share/create`、`shared-with-me` 等接口，验证在携带合法 API Key 时的用户识别和隔离。

### 3.2 共享播放联动验证
* 伪造分享关系（A 分享给 B 某个视频），以 B 的 API Key 请求该视频的 `PlaybackInfo` and `stream` 接口，验证在 B 对原库无权访问时，Go 后端是否能成功通过 Admin API Key 解析并 302 重定向到网盘直链。

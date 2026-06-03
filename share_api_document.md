# 私有视频空间分享系统 (Share API) 对接文档

本文档定义了 `go-emby2openlist` 反代后端提供的私有视频分享 API。前端（如 `Pelagica`）可按照此规范进行接口对接。

---

## 一、 核心设计说明

### 1. 解决鉴权死结 (重要)
* **死结场景**：用户 A 将视频共享给用户 B。但用户 B 的 Emby 账号被禁用了该视频所处媒体库的访问权限。如果前端直接用用户 B 的身份去向 Emby 索取该 `media_id` 的元数据（如海报、简介），会直接触发 Emby 返回 403 权限错误。
* **解决策略**：所有的“共享给我的”视频列表，前端只需请求 Go 代理的 `/api/share/shared-with-me` 接口。**Go 后端在内部会自动通过 Admin API Key 批量向 Emby 调取媒体元数据**，完成聚合后返回给前端。前端**绝对不要**自行拿着受限用户的 Token 去 Emby 查询被分享的 `media_id`。

### 2. 分页与数量控制
后端在获取“共享给我的”和“我的分享”列表时，默认支持标准分页参数（`StartIndex` 和 `Limit`），数据结构完全对齐 Emby 官方的分页响应格式（提供 `TotalRecordCount` 和 `Items` 数组），极大降低了前端对下拉加载和滚动分页组件的开发适配成本。

---

## 二、 基础配置与全局约定

1. **基本路径**：所有自定义分享接口以 `/api/share` 开头。
2. **身份鉴权**：请求时必须在 Header 中携带客户端的鉴权 Token：
   - 方式一：`X-Emby-Token: <token>`
   - 方式二：`Authorization: MediaBrowser Client="...", Device="...", DeviceId="...", Version="...", Token="<token>"`
   - 方式三：Query 参数携带 `api_key=<token>`

---

## 三、 API 接口详述

### 1. 获取所有可分享的用户列表
用于用户 A 在点击分享弹窗时，拉取当前系统内的用户列表（自动排除自己）。

* **请求路径**：`GET /api/share/users`
* **Query 参数**：无
* **成功响应 (200 OK)**：
```json
[
  {
    "Id": "9b64c6734d0b490f845a7b6b194d6935",
    "Name": "user_b"
  },
  {
    "Id": "a73982bc461c9e88aa567bb90a823e42",
    "Name": "user_c"
  }
]
```

---

### 2. 创建视频分享
将某个单视频（`media_id`）分享给一名或多名指定的用户。

* **请求路径**：`POST /api/share/create`
* **Content-Type**：`application/json`
* **请求体 (Body)**：
```json
{
  "media_id": "49015", // Emby 中的视频 Item.Id
  "targets": [
    "9b64c6734d0b490f845a7b6b194d6935", // 目标用户的 UserID
    "a73982bc461c9e88aa567bb90a823e42"
  ]
}
```
* **成功响应 (200 OK)**：
```json
{
  "success": true,
  "msg": "分享成功，已创建 2 条共享记录"
}
```

---

### 3. 获取我发起的分享 (我的分享)
展示当前用户分享出去的所有视频。支持分页。

* **请求路径**：`GET /api/share/mine`
* **Query 参数**：
  - `StartIndex` (可选，默认 `0`)：从第几条记录开始。
  - `Limit` (可选，默认 `20`)：返回的记录条数。
* **成功响应 (200 OK)**：
```json
{
  "TotalRecordCount": 3,
  "Items": [
    {
      "id": 12, // 分享关系表的主键 ID，用于取消分享
      "media_id": "49015",
      "media_name": "宝宝的第一次爬行",
      "target_user_id": "9b64c6734d0b490f845a7b6b194d6935",
      "target_username": "user_b",
      "created_at": "2026-06-02 21:00:00",
      "expire_at": null,
      "status": 1
    }
  ]
}
```

---

### 4. 获取共享给我的视频列表 (共享库)
拉取其他用户共享给当前登录用户的所有视频。
**注意：返回的 `Items` 内部字段与标准的 Emby/Jellyfin `BaseItemDto` 元数据格式完全一致，前端可以直接使用原有的海报墙组件和卡片组件渲染！**

* **请求路径**：`GET /api/share/shared-with-me`
* **Query 参数**：
  - `StartIndex` (可选，默认 `0`)：分页起始偏移量。
  - `Limit` (可选，默认 `20`)：每页数量限制。
* **成功响应 (200 OK)**：
```json
{
  "TotalRecordCount": 15,
  "Items": [
    {
      "Id": "49015", // 原始视频在 Emby 的 ItemId
      "Name": "宝宝的第一次爬行",
      "Type": "Movie",
      "ImageTags": {
        "Primary": "e1a6c72..."
      },
      "RunTimeTicks": 1800000000,
      "Overview": "记录了宝宝第一次在地板上爬行的珍贵画面...",
      "UserData": {
        "PlaybackPositionTicks": 0,
        "PlayCount": 0,
        "Played": false
      },
      "ShareOwnerName": "user_a" // 额外扩展字段：该共享的提供者
    }
  ]
}
```

---

### 5. 取消特定的分享关系
通过分享关系的 ID 立即收回分享权限。

* **请求路径**：`DELETE /api/share/:id` (如 `/api/share/12`)
* **成功响应 (200 OK)**：
```json
{
  "success": true,
  "msg": "分享已取消"
}
```

---

### 6. 查询某分享详情
* **请求路径**：`GET /api/share/:id`
* **成功响应 (200 OK)**：
```json
{
  "id": 12,
  "media_id": "49015",
  "owner_user_id": "a1b2c3d4...",
  "target_user_id": "9b64c673...",
  "created_at": "2026-06-02 21:00:00",
  "status": 1
}
```

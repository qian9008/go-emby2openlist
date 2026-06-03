# 私有视频空间分享系统 PRD v1.0

## 一、项目背景

当前媒体架构：

```text
Jellyfin
    ↓
go-emby2openlist
    ↓
OpenList(AList)
    ↓
云盘 / 本地存储
```

现有问题：

- Jellyfin 权限控制粒度为媒体库级别
- 无法实现单文件分享
- 无法将指定视频分享给指定用户
- 无法构建类似 Google Photos 的家庭视频共享空间
- 不希望通过软链接、硬链接、媒体库重扫实现分享

### 项目目标

实现：

```text
媒体级分享（Media Share）
```

而非：

```text
媒体库级分享（Library Share）
```

***

# 二、产品目标

构建一个私有视频空间系统，实现：

### 用户A

拥有：

```text
宝宝成长.mp4
```

点击分享：

```text
分享给：
✓ 用户B
✓ 用户C
✓ 用户D
```

### 用户B

登录后可在：

```text
共享给我的
```

栏目中看到：

```text
宝宝成长.mp4
```

并可直接播放。

***

## 保持原有 Jellyfin 能力

<br />

***

# 三、产品原则

## P1：不修改 Jellyfin 媒体库

禁止：

- 创建软链接目录
- 创建共享目录
- 自动重扫媒体库
- 动态创建媒体库

***

## P2：不创建新的媒体实体

禁止：

- 复制媒体
- 新建媒体项
- 克隆 Item

***

## P3：所有分享引用原始媒体

分享关系：

```text
Share
    ↓
MediaId
    ↓
Jellyfin Item
```

始终指向同一个媒体实体。

***

# 四、系统架构

```text
┌──────────────────────┐
│   Jellyfin-Vue UI    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│    Share Service     │
│        (Go)          │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│    Jellyfin API      │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ go-emby2openlist     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ OpenList / AList     │
└──────────┬───────────┘
           │
           ▼
      云盘 / 本地存储
```

***

# 五、核心概念

## User

Jellyfin 用户

```sql
user_id
username
```

***

## Media

媒体实体

对应 Jellyfin：

```text
Item.Id
```

例如：

```text
media_id = 1001
```

***

## Share

分享关系

```sql
share_id
media_id

owner_user_id
target_user_id

created_at
expire_at

status
```

***

# 六、功能需求

## FR-001 创建分享

### 发起人

用户A

### 操作

点击：

```text
分享
```

弹出：

```text
选择用户

☑ 用户B
☑ 用户C
☑ 用户D
```

确认后创建分享关系。

***

### 数据写入

```sql
media_id=1001

A -> B
A -> C
A -> D
```

***

## FR-002 我的分享

新增菜单：

```text
我的分享
```

显示：

```text
宝宝成长.mp4

已分享给：
B
C
D
```

支持：

- 查看分享对象
- 删除分享
- 批量取消分享

***

## FR-003 共享给我的

新增菜单：

```text
共享库
```

系统查询：

```sql
target_user_id = 当前用户
```



***

## FR-004 查看媒体详情

展示：
复用其他库样式
数据来源：

```text
Jellyfin API
```

***

## FR-005 播放共享媒体

用户点击播放：

```text
共享库
    ↓
媒体详情
    ↓
播放
```

系统流程：

```text
验证分享权限
      ↓
获取 item_id
      ↓
调用 Jellyfin API
      ↓
返回播放信息
```

***



### 数据隔离


互不影响。

***

## FR-007 取消分享

用户A：

```text
我的分享
    ↓
取消分享
```

立即失效。

用户B：

```text
共享给我的
```

列表自动消失。

***


***

# 七、权限模型

## Owner

分享发起者

权限：

- 查看
- 分享
- 取消分享

***

## Target User

被分享用户

权限：

- 查看
- 播放

禁止：
- 删除原媒体

***

# 八、数据库设计

## share\_items

```sql
CREATE TABLE share_items (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,

    item_id VARCHAR(64) NOT NULL,

    owner_user_id VARCHAR(64) NOT NULL,

    target_user_id VARCHAR(64) NOT NULL,

    created_at DATETIME,

    expire_at DATETIME,

    status TINYINT DEFAULT 1
);
```

***

## 索引

```sql
CREATE INDEX idx_target_user
ON share_items(target_user_id);

CREATE INDEX idx_owner
ON share_items(owner_user_id);

CREATE INDEX idx_media
ON share_items(media_id);
```

***

# 九、API 设计

## 创建分享

```http
POST /api/share/create
```

请求：

```json
{
  "media_id": "1001",
  "targets": [
    "user_b",
    "user_c"
  ]
}
```

***

## 我的分享

```http
GET /api/share/mine
```

***

## 共享给我的

```http
GET /api/share/shared-with-me
```

返回：

```json
[
  {
    "media_id":"1001",
    "owner":"A"
  }
]
```

***

## 取消分享

```http
DELETE /api/share/{id}
```

***

## 查询分享详情

```http
GET /api/share/{id}
```

***

# 十、Jellyfin 集成设计

## 管理员 API Key

Share Service 保存：

```text
Jellyfin Admin API Key
```

用于：

- 查询媒体信息
- 查询用户
- 获取封面
- 获取 Item 信息

***

### 安全要求

禁止：

```text
前端保存管理员 Key
```

管理员 Key 仅允许：

```text
Share Service 使用
```

***

# 十一、前端改造

基于：

pelagica

新增模块：

```text
共享库

我的分享

详情页分享弹窗

 用户选择器

分享管理页
```

***

# 十二、页面结构

```text
首页

电影
电视剧
家庭视频

共享库
我的分享

收藏
历史记录
设置
```

***

# 十三、MVP 范围

第一阶段实现：

✅ 单文件分享

✅ 指定用户分享

✅ 共享列表

✅ 播放

✅ 播放记录保留

✅ 取消分享

✅ 用户搜索

***

暂不实现：

❌ 公开分享

❌ 分享链接

❌ 分享密码

❌ 到期分享

❌ 分享树

❌ 链路分享

❌ 分享统计

***

# 十四、未来规划（V2）

## 分享链接

```text
分享链接
    ↓
生成 Share URL
```

***

## 到期时间

```text
7天
30天
永久
```

***

## 分享密码

```text
访问密码
```

***

## 链路分享

```text
A → B → C
```

***

## 分享统计

查看：

- 谁看过
- 播放次数
- 最后访问时间

***

# 十五、最终产品定位

打造一个：

```text
Google Photos 家庭共享
+
Plex Share
+
Jellyfin 播放能力
+
OpenList 存储能力
```

的私有视频空间系统。

核心原则：

- 不修改 Jellyfin 数据库
- 不重扫媒体库
- 不创建软链接
- 不复制媒体
- 保留 Jellyfin 原生播放体验
- 实现媒体级用户分享
- 支持未来扩展公开分享与链路分享

```
```


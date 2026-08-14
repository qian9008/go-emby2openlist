# 分享列表与日志噪声修复实施计划

本计划旨在解决以下两个核心痛点：
1. **分享无可选用户 (404 错误)**：前端因服务器地址末尾斜线导致拼接出双斜线路径 `//api/share/users`，触发后端路由严格正则匹配失败（404）。
2. **终端日志杂乱且有乱码**：播放与浏览时频繁产生的图片、进度上报、字幕、WebSocket 等成功日志刷屏，且彩色 ANSI 代码在非兼容终端出现乱码。

---

## 拟修改文件

### [Component: 前端 API 拼接]
#### [MODIFY] [share.ts](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/api/share.ts)
* 规范化 `getServerUrl()` 返回的地址，移去末尾的 `/`。
* 影响函数：`fetchShareUsers`, `createShare`, `fetchMyShares`, `fetchSharedWithMe`, `deleteShare`。

### [Component: 后端路由与匹配]
#### [MODIFY] [handler.go](file:///d:/Users/Documents/1/emby2openlist/internal/web/handler.go)
* 引入 `"strings"` 标准库。
* 对请求的 `c.Request.RequestURI` 的 Path 部分（问号前）进行多余斜线规范化（将重复的 `//` 清洗为单斜线 `/`），再进行路由正则匹配。

### [Component: 后端日志控制与配置]
#### [MODIFY] [config.go](file:///d:/Users/Documents/1/emby2openlist/internal/config/log.go)
* 修改 `Log` 结构体，新增 `Verbose`（是否输出全部详细日志）与 `IgnorePaths`（用户自定义忽略路径）字段。

#### [MODIFY] [config-example.yml](file:///d:/Users/Documents/1/emby2openlist/config-example.yml)
* 补充 `log` 部分配置，增加对 `verbose` 模式和 `ignore-paths` 的详细注释，并在注释中提示 Windows 用户可开启 `disable-color` 解决彩色代码导致的乱码问题。

#### [MODIFY] [log.go](file:///d:/Users/Documents/1/emby2openlist/internal/web/log.go)
* 引入 `"strings"` 库和 `github.com/AmbitiousJun/go-emby2openlist/v2/internal/config`。
* 在 `CustomLogger` 中，当 `config.C.Log.Verbose` 为 `false` 且状态码小于 400 时，自动过滤高频且无排错意义的成功日志（包括图片、播放进度上报、字幕、WebSocket 握手与心跳、前端静态资源等），支持依据 `IgnorePaths` 过滤。

---

## 验证计划

### 1. 接口连通性验证
* 启动后端后，使用浏览器或命令行测试 `http://192.168.50.99:8095//api/share/users` 能够成功返回 `200` 并列出用户，验证双斜杠兼容功能。
* 观察 Pelagica 前端分享弹窗，确认“无可分享用户”的警告消失，能够正常加载可选的用户列表。

### 2. 日志精简与乱码测试
* 浏览前端页面并尝试播放媒体，观察 Go 控制台日志输出。
* 在 `verbose: false` 下，确认只有初始化信息或出错（如 400+）日志输出，播放进度、海报图片等大量 200 成功日志不再刷屏。
* 在配置文件中修改 `disable-color: true`，验证控制台不再出现 `[38;2;...m` 等 ANSI 乱码字符。

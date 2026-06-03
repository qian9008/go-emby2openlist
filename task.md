# 私有视频空间分享系统 - 后端拦截与穿透任务

- `[x]` 1. 修改 `internal/service/share/share.go`：解除对 `emby` 包的依赖，自行实现获取 ApiKey
- `[x]` 2. 修改 `internal/service/emby/media.go`：在 `resolveItemInfo` 中注入管理员提权逻辑
- `[x]` 3. 修改 `internal/service/emby/playbackinfo.go`：在 `LoadCacheItems` 中拦截分享 Item 详情查询
- `[x]` 4. 编写自动化集成测试脚本 `internal/service/share/share_integration_test.go`
- `[x]` 5. 编译并运行集成测试，观测无权用户 B 对分享视频的详情、播放及直链获取情况

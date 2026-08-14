# 详情页与播放器返回/导航历史及分享 API 路由优化实施计划

本计划包含两部分内容：
1. **解决返回按钮问题**（已批准并执行完毕）：改用 `navigate(-1)` 实现返回。
2. **解决分享接口 404/不可用问题**（新增）：将前端自定义分享 API 的请求路径从相对路径改为动态拼接 Emby 代理服务（`ge2o`）的实际主机地址。

---

## 1. 核心设计与发现

- **问题现象**：前端在进行分享操作时，弹窗提示“无可分享的用户或分享服务不可用”，网络请求 `/api/share/users` 返回 `404`。
- **问题根源**：前端代码中调用 `/api/share/*` 时使用的是相对路径。由于前端配置了 Vite 代理/Nginx 代理，所有的 `/api/*` 请求全都被转发到了端口 `4321`（Pelagica 自身的 Node/Go 后端），而我们的分享 API 实际上实现在端口 `8095`（`ge2o` 后端）。
- **解决方案**：
  - 在 `pelagica/frontend/src/api/share.ts` 中引入 `getServerUrl`。
  - 获取当前在浏览器中配置并登录的 Emby 代理服务地址（即 `ge2o` 主机地址，形如 `http://192.168.50.99:8095`）。
  - 将所有自定义分享 API 请求的前缀动态拼接该地址（例如：`getServerUrl() + '/api/share/users'`），使其直接通过 `ge2o` 后端，不再被 Pelagica 后台错误拦截。

---

## 2. 拟修改文件列表

### [MODIFY] [share.ts](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/api/share.ts)
- 引入 `getServerUrl` 并更新 `fetchShareUsers`, `createShare`, `fetchMyShares`, `fetchSharedWithMe`, `deleteShare` 五个函数的请求前缀。

---

## 3. 验证计划

1. **分享列表拉取验证**：
   - 登录前端，打开影片详情，点击“分享”按钮。
   - 验证网络请求是否正确发往 `http://192.168.50.99:8095/api/share/users` 并且返回状态码 `200`，且成功列出 Emby 系统的其他用户。

# 私有视频空间分享系统集成实施计划 (前端对接部分)

本计划的目标是在 `pelagica/frontend` 前端项目中全面对接 Go 后端的私有视频分享 API。系统包含三大部分：影片详情页的分享对话框、侧边栏及独立的“共享库”海报墙页面、以及设置页中的“分享管理”面板。

同时，确保在 Go 后端由于未配置或未启动时，前端 API 捕获异常并降级，不阻滞核心界面的加载。

---

## 1. 拟修改与新增文件列表

### [Component: API 逻辑与对接]
#### [NEW] [share.ts](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/api/share.ts)
* 封装分享相关的 Axios / Fetch 请求函数，带上 credentials 头部（与 `getApi` 的认证机制对齐）：
  - `fetchShareUsers()`: `GET /api/share/users`
  - `createShare(mediaId: string, targets: string[])`: `POST /api/share/create`
  - `fetchMyShares(startIndex: number, limit: number)`: `GET /api/share/mine`
  - `fetchSharedWithMe(startIndex: number, limit: number)`: `GET /api/share/shared-with-me`
  - `deleteShare(id: number)`: `DELETE /api/share/:id`
* 包含 `try-catch` 降级，避免后端服务不可用时阻断 React 生命周期。

#### [MODIFY] [sidebar.json (en & zh)](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/locales/zh/sidebar.json)
* 在语言包中新增侧边栏的汉化及英文键名：
  - `shared_library`: "共享库" (ZH) / "Shared Library" (EN)

### [Component: 分享弹出框]
#### [NEW] [ShareDialog.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/components/ShareDialog.tsx)
* 提供弹窗 UI（采用 `src/components/ui/dialog.tsx`）：
  - 在渲染时，自动向 `/api/share/users` 拉取除了当前用户以外的系统用户。
  - 用户勾选需要分享的用户（支持多选），点击确认后调用 `/api/share/create`。
  - 带骨架屏 Loading 态和 Sonner 优雅提示框（成功/失败）。

### [Component: 详情页集成]
#### [MODIFY] [MoviePage.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Item/MoviePage.tsx)
* 在影片按钮动作栏内增加“分享”按钮（使用 `Share2` 图标），点击弹出 `ShareDialog`。

#### [MODIFY] [SeriesPage.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Item/SeriesPage.tsx)
* 同上，在电视剧详情页的动作栏内增加“分享”按钮。

### [Component: 侧边栏与路由集成]
#### [MODIFY] [AppSidebar.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/components/AppSidebar.tsx)
* 在侧边栏导航列表（首页、媒体库、搜索之间）新增“共享库”入口，绑定 `FolderHeart` 或 `Users` 图标。

#### [MODIFY] [main.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/main.tsx)
* 导入并注册 `/shared-library` 路由，指向 `SharedLibraryPage`。

### [Component: 共享库页面]
#### [NEW] [SharedLibraryPage.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/SharedLibrary/SharedLibraryPage.tsx)
* 共享库首页，渲染其他用户分享给当前用户的视频列表。
* 内部调用 `/api/share/shared-with-me`（支持分页）。
* 使用前端现有的海报卡片组件渲染，且若 item 含有 `ShareOwnerName` 扩展字段，在卡片上悬浮渲染“由 XXX 分享”的精美磨砂气泡标徽。

### [Component: 设置与分享管理]
#### [MODIFY] [SettingsPage.tsx](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Settings/SettingsPage.tsx)
* 在设置侧边 Tab 中，新增一个“分享管理” (Share Management) 选项卡。
* 展示自己分享出去的历史记录列表（从 `/api/share/mine` 拉取，支持分页，带影片名称与分享目标用户名称）。
* 每一项后方提供“取消分享”按钮，点击调用 `deleteShare(id)` 软删除分享，并自动刷新当前列表。

---

## 2. 验证方案

### 2.1 后端未启动降级测试
* 关闭 Go 后端服务，打开前端，验证“首页”和“设置页”等页面能否无缝加载，控制台打印 Warning 警告但 UI 绝不阻滞或一直处于 Loading 骨架状态。
* 电影详情页点击“分享”按钮能正常弹窗，但在拉取用户列表失败时显示“无法连接分享服务”。

### 2.2 功能性测试
* 启动 Go 后端，配置 `admin-api-key`。
* 登录 A 账号，在电影页面点击“分享”，拉取用户列表，选择 B 进行分享。
* 在设置页的“分享管理”中，验证是否出现刚分享的记录。
* 登录 B 账号，点击侧边栏的“共享库”，验证是否出现 A 分享的电影海报，并能正常点击进入详情并播放（通过反代转码重定向）。

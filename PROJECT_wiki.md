# PROJECT_wiki

本 Wiki 记录了本项目二次开发过程中新增或变更的公共工具、核心数据结构及重要技术决策，以便于维护与后续迭代。

---

## 🛠️ 公共工具与通用配置变更

### 1. Jellyfin 静态图片 URL 拼接服务 (`jellyfinUrls.ts`)
* **文件路径**：`pelagica/frontend/src/utils/jellyfinUrls.ts`
* **变更目的**：修复物理文件夹在缺失或默认 `tag` 下触发 Jellyfin 强行鉴权时产生的 `404 Not Found` 错误。
* **修改函数**：
  - `getBackdropUrl`
  - `getLogoUrl`
  - `getThumbUrl`
  - `getPrimaryImageUrl`
  - `getItemImageUrl`
  - `getUserProfileImageUrl`
* **接口变更详情**：
  在拼接以上静态图片 URL 时，鉴权参数名由非标的 `token` 修正为了标准的 **`api_key`**（为保持旧版向前兼容性，在 query 参数中同时携带了 `api_key` 和 `token`）。
  ```typescript
  // 修正后的通用鉴权拼接模板
  url.searchParams.append('api_key', token);
  url.searchParams.append('token', token);
  ```

### 2. Vite 本地开发服务器监听网卡变更 (`vite.config.ts`)
* **文件路径**：`pelagica/frontend/vite.config.ts`
* **变更目的**：允许局域网内其他设备（手机、平板、网线连接的其他电脑）访问和调试本地前端服务。
* **配置变更详情**：
  在 `server` 块内新增了 **`host: '0.0.0.0'`**，使 Vite 服务端监听所有网络接口。
  ```typescript
  server: {
      host: '0.0.0.0', // 开启局域网共享监听
      port: 3000,
      allowedHosts: ['mbjan.local'],
      ...
  }
  ```

### 3. 简体中文国际化及默认语言初始化配置 (`i18n.ts` & `NavUser.tsx` & 语言包)
* **文件路径**：
  - `pelagica/frontend/src/i18n.ts`
  - `pelagica/frontend/src/components/NavUser.tsx`
  - `pelagica/frontend/src/locales/zh/` (新增 10 个 JSON 语言配置文件)
* **变更目的**：全面实现 Pelagica 前端项目的简体中文支持，并使用户首次打开时默认选择中文界面。
* **技术决策与配置变更详情**：
  - **默认语言首发判定**：为在保留用户手动语言选择偏好的同时，确保新用户首次访问时默认呈现中文，我们在 `i18n.ts` 初始化前，增加对 `localStorage` 的 `i18nextLng` 字段的判断。若未设定该值，我们强制预设为 `'zh'`。
    ```typescript
    if (typeof window !== 'undefined' && !localStorage.getItem('i18nextLng')) {
        localStorage.setItem('i18nextLng', 'zh');
    }
    ```
  - **个人菜单中文化选项**：在 `NavUser.tsx` 语言切换多级下拉菜单的最顶端，添加“简体中文”选项，并绑定中国国旗（`FlagIcon countryCode="cn"`）：
    ```tsx
    <DropdownMenuItem onClick={() => i18n.changeLanguage('zh')}>
        <FlagIcon countryCode="cn" />
        简体中文
    </DropdownMenuItem>
    ```
  - **精细汉化语言包**：新增 `zh/` 汉化命名空间目录，提供了对系统常规文字、主页版块、详情页、媒体库、登录授权、快捷菜单、播放器设置及主题市场全方位的简体中文本土化翻译。

### 4. 架构与反代连接分析文档 (`proxy_implementation_analysis.md`)
* **文件路径**：[proxy_implementation_analysis.md](file:///d:/Users/Documents/1/emby2openlist/proxy_implementation_analysis.md)
* **变更目的**：建立对 `go-emby2openlist` 的反向代理实现原理及第三方前端 `Pelagica` 的数据交互机制的清晰分析文档，便于项目架构演进与二开维护。
* **主要内容**：
  - 阐述了基于 Go + Gin 的全局路由匹配、正则规则拦截与底层 `ProxyPass` 的流量透传机制。
  - 厘清了 `Pelagica` 前端必须连接 Go 反代服务器（在前端设置的 Server URL 中填写反代服务地址）而非直连原始 Emby/Jellyfin 的核心架构逻辑，指明唯有如此才能使网盘直链拦截重定向、转码优化及定制化 API 配置写入等功能生效。

### 5. 原项目纯后端反代与直链重定向机制文档 (`original_proxy_implementation.md`)
* **文件路径**：[original_proxy_implementation.md](file:///d:/Users/Documents/1/emby2openlist/original_proxy_implementation.md)
* **变更目的**：深度拆解原项目（无 `Pelagica` 状态下）如何仅靠 Go 反代后端和脚本注入去完美劫持官方客户端与官方 Web 网页端的原理。
* **主要内容**：
  - **核心重定向**：阐明了拦截视频流/下载请求，回源获取物理地址并经由 OpenList 计算转化为最新的网盘 CDN 临时直链，最后返回 `HTTP 302` 以对任意 Emby 客户端（如官方 App、Infuse 等）实现零二开直链劫持的底层技术流程。
  - **网页脚本注入**：分析了拦截官方 `index.html` 强行植入 `/emby2openlist/custom.js` 与 `custom.css`，在内存中组合各 JS 脚本包裹成自执行函数，在 `ApiClient` 初始化后自动唤醒，以达成官方前端捕获播放并调起 PotPlayer/IINA 本地播放器等高级客户端体验增强的功能。

### 6. 私有视频空间分享系统集成实施计划 (`implementation_plan.md`)
* **文件路径**：[implementation_plan.md](file:///d:/Users/Documents/1/emby2openlist/implementation_plan.md)
* **变更目的**：详细设计如何在 go-emby2openlist 代理中整合分享功能 API 及相关的数据安全和重定向技术设计。
* **主要内容**：
  - 设计了利用线程安全加锁的 `shares.json` 在本地做轻量零依赖持久化的方案。
  - 规定了在 Go 后端如何拦截接口，调用 Emby `/Users/Me` 解析提取当前鉴权用户的机制。
  - 确立了配置 `emby.admin-api-key` 后，借用管理员权限帮被分享但无原库访问权限的用户查询原文件物理路径，并重定向至网盘直链的安全代理流程。

### 7. 私有视频空间分享系统接口对接文档 (`share_api_document.md`)
* **文件路径**：[share_api_document.md](file:///d:/Users/Documents/1/emby2openlist/share_api_document.md)
* **变更目的**：为前端提供清晰、健全、防权限死结且具备分页机制的自定义分享 API。
* **主要内容**：
  - **避开鉴权死结**：规定前端在“共享库”中只需请求后端的 `/api/share/shared-with-me`，由 Go 代理服务在内部使用管理员 Key 代为拉取并聚合视频元数据（返回完全对齐 Emby BaseItemDto 的元数据结构），解决非管理用户越权访问 403 痛点。
  - **后端分页对齐**：定义了 `/api/share/mine` 和 `/api/share/shared-with-me` 接口中的 `StartIndex` 和 `Limit` 分页标准，并返回对齐 Emby 规范的 `TotalRecordCount` 和 `Items` 包装格式。
  - **接口详述**：提供了创建分享、我的分享、共享给我、取消分享、用户列表拉取等 6 个核心接口的详尽 JSON 输入输出示例。

---

## 📊 核心判定逻辑与数据结构

### 1. 物理子文件夹封面反哺与分治判定模型 (`LibraryItem.tsx`)
* **文件路径**：`pelagica/frontend/src/pages/Library/LibraryItem.tsx`
* **设计目的**：
  让物理文件夹（即使服务端本身没有图片）能够拥有灵动精美的海报封面，并完全消灭 404 图片报错噪音。
* **分治判定模型**：
  ```typescript
  // 区分普通物理子目录和主媒体库
  const isPhysicalFolder = item.Type === 'Folder';
  const isCollectionFolder = item.Type === 'CollectionFolder';
  const isFolder = item.IsFolder || isPhysicalFolder || isCollectionFolder;

  // 检查该文件夹是否有封面图哈希
  const hasPrimaryImage = !!item.ImageTags?.Primary;
  ```
* **封面动态反哺逻辑**：
  异步子查询（限制 `limit: 10` 以保护性能）拉取物理文件夹下所有视频：
  - **有播放进度时（优先）**：选取“未播放完且进度百分比最短”的那个子视频的海报图作为当前文件夹的封面，卡片底部渲染红色进度条。打造极致灵动的“继续观看”磁贴体验。
  - **无播放进度时（次高优先级）**：若文件夹内有视频文件，从其内部**随机挑选一个视频的封面图**作为当前物理文件夹的封面，底部无进度条。让没有观看进度的文件夹海报墙同样色彩丰富、摆脱单调。
  - **无任何视频文件时（退路降级）**：渲染微渐变、带黄色 `FolderClosed` 图标的高颜值物理文件夹封套卡片 `FolderWrapper`。
  
  ```typescript
  // 当前卡片最终采用的封面图片
  const finalPosterUrl = isPhysicalFolder 
      ? (hasPrimaryImage ? posterUrl : folderCoverUrl)
      : posterUrl;

  // 是否渲染黄色文件夹图标：只有无主图且无子图片反哺时渲染
  const shouldRenderFolderIcon = isPhysicalFolder && !hasPrimaryImage && !folderCoverUrl;
  ```

---

## 🎨 视觉标志组件与 UX 优化

### 1. 文件夹左上角微指示器 (`FolderCornerIndicator`)
- **时机**：当文件夹成功反哺出海报图片（即 `!shouldRenderFolderIcon && isFolder`）时。
- **渲染规格**：`absolute top-1.5 left-1.5`，配置磨砂高斯模糊黑色半透明背景 (`bg-black/60 backdrop-blur-md border border-white/10`)，嵌套金色 Lucide `FolderClosed` 文件夹小图标，为用户提供极其清晰而高端的“层级目录”属性辨识。

### 2. 完播影片无条件绿色打勾
- **逻辑**：将 `WatchedStateBadge` 的 `show` 属性强制更改为 `!isFolder`，从而绕过原本繁琐的后台偏好变量。
- **效果**：
  - 非文件夹普通视频只要已完播（`Played === true`），卡片右上角无条件精准浮现绿色打勾圆 badge。
  - 未播完剧集（如 Series 等）卡片右上角无条件显示未看集数剩余数量。

### 3. 杜绝 9:16 及竖版海报在横屏卡片中的拉伸变形 (绝对定位 + h-auto 终极双强盾版)
- **设计原理**：
  - **Grid Stretch 物理拉伸**：在 CSS Grid 弹性布局中，默认对齐方式为 `align-items: stretch`，迫使同排高度较短的卡片（如描述文字少或标题短的 `<Link>` 网格项）在高度上被强行拉伸，以与同排最高卡片对齐。
  - **容器被挤压撕裂**：若内层图片容器仅声明了 `w-full`，其物理高度会被外层的拉伸力场强行填充拉长，致使 `aspect-ratio` 比例宣告失守，引起内部图片严重拉伸。
  - **百分比高度失效**：在 CSS 规范中，非固定物理像素高度的容器，子元素的 `height: 100%`（`h-full`）会退化为 `auto`，使 `object-fit: cover` 无法执行裁剪。
- **解决方案**：
  - **高度自适应保护 (`h-auto`)**：将 List 和 Grid 下的图片容器 `div` 升级，类名加入 **`h-auto`**（即 `height: auto`），强制要求高度完全由其纵横比和宽度自适应，**彻底拦截外层 Link 被 Grid 强制 stretch 拉高引起的纵横比形变**！
  - **行内绝对定位锁死**：图片 `<img>` 标签全面升级为 **`absolute inset-0`**，并在行内样式中高强度锁死：
    ```typescript
    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', zIndex: 10 }}
    ```
- **效果**：双保险防御，外层无论如何高度拉伸，内层图片容器纵横比绝对巍然不动，海报在任何横屏/竖屏不规则图片混搭下，**100% 居中裁剪填充，杜绝一切压扁拉伸变形！**

---

## 🕵️ 重大技术决策：根除 Emby/Jellyfin 服务端“图片硬拉伸”

### 1. 终极痛点破案
在开发 9:16 海报彻底防拉伸裁剪中，我们发现即便前端已经写了绝对定位（`absolute inset-0`）和 `object-fit: cover` 锁定，页面在浏览器中渲染出来的海报仍然处于被压扁或拉伸的变形状态。
* **原因分析**：Jellyfin/Emby 的图片转码服务有一个核心机制。当它在 Primary 图片请求中**同时检测到 `width` 和 `height` 这两个参数时**，为了强行“填满”你请求的 16:9 物理格子，**服务端会在传回浏览器前就把这幅原本是 9:16 的竖版图片等比例压扁、拉伸为一张 16:9 的横版文件并直接传回！**
* **CSS 踏空**：这导致浏览器拿到手的文件**在物理上本身就是个拉扁的脏横图**。它的物理长宽比与 16:9 容器完全契合，因此 `object-fit: cover` 判定“高宽贴合，无需任何裁剪”，从而直接将本就拉伸的原图渲染在屏幕上。

### 2. 解决方案：单向宽度控制
我们对 Primary 降级请求做出了重大调整：**在 Primary 竖版图片作为横版封面降级或反哺时，彻底剔除 `height` 参数，仅保留 `width: 640` 作为单向分辨率限制**。
* **效果**：Emby 服务端由于只接受到 `width` 单向限制，**必定会等比例缩放原图并保持原生的竖版（9:16/2:3）图片比例返回浏览器**。
* **极速渲染**：客户端拿到原生比例的高清竖图后，前端的绝对定位容器与 `object-fit: cover` 顺理成章、100% 完美地对其进行居中裁剪，**彻底治愈了服务端强拉伸，实现了大片级完美海报墙！**

---

## 🔗 私有视频空间分享系统 (Go 后端)

### 1. 核心数据存储引擎 (`internal/service/share/share.go`)
* **文件路径**：`internal/service/share/share.go`
* **设计理念**：零外部依赖的轻量级持久化方案。使用 `sync.RWMutex` 保护的内存 `[]ShareItem` 切片作为存储，突变操作后懒写入 `shares.json`。
* **核心数据结构**：
  ```go
  type ShareItem struct {
      Id            int64  // 自增主键
      MediaId       string // Emby Item ID
      OwnerUserId   string // 分享发起者 ID
      TargetUserId  string // 被分享者 ID
      Status        int    // 1=有效, 0=已取消 (软删除)
  }
  ```
* **Emby 辅助方法**：
  - `GetCurrentUser(c)` — 从请求中的 API Key 查询 `/emby/Users/Me` 获取当前用户身份
  - `GetAllEmbyUsers()` — 使用 admin-api-key 获取系统用户列表
  - `GetItemInfoByAdmin(itemId)` — 使用 admin-api-key 跨权限获取媒体元数据

### 2. API 处理器 (`internal/service/share/handler.go`)
* **文件路径**：`internal/service/share/handler.go`
* **6 个 API 端点**：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/share/users` | GET | 获取可分享的用户列表 (排除自己) |
| `/api/share/create` | POST | 创建分享 (支持批量目标用户) |
| `/api/share/mine` | GET | 获取我发起的分享 (分页, 带 media_name) |
| `/api/share/shared-with-me` | GET | 获取共享给我的视频 (分页, 返回 Emby BaseItemDto) |
| `/api/share/{id}` | GET | 查询分享详情 |
| `/api/share/{id}` | DELETE | 取消分享 (仅 owner 有权) |

### 3. 配置变更 (`internal/config/emby.go`)
* `Emby.AdminApiKey` (yaml: `admin-api-key`) — 管理员 API 密钥，用于分享系统跨权限查询媒体信息。

### 4. 路由注册 (`internal/web/route.go`)
* 在正则路由规则表中注册了 5 条分享路由，置于 catch-all `Reg_All` 之前。
* 新增 `shareMethodGuard()` 和 `shareMethodRouter()` 辅助函数，用于在正则路由系统中区分 HTTP 方法。

### 5. 循环依赖架构优化
* **改动细节**：从 `internal/service/share/share.go` 中移除了对 `emby` 包的依赖。新增内部自主解析 API Key 的工具函数 `getRequestApiKey(c)`，彻底断开 `share` 包 -> `emby` 包的单向引用。
* **效果**：解耦后，`emby` 包可以安全地引入并调用 `share` 包进行权限判定与提权拦截。

### 6. 管理员代请求与权限穿透拦截机制
* **详情获取拦截 (`playbackinfo.go` - `LoadCacheItems`)**：
  在处理客户端获取详情请求时，拦截已被分享给当前用户的 `itemId`，不再直接向 Emby 转发。改为在后台调用管理员方法 `share.GetItemInfoByAdmin(itemId)` 穿透越权拉取元数据，高保真返回给无权用户 B。
* **播放与重定向提权 (`media.go` - `resolveItemInfo`)**：
  在播放、PlaybackInfo、串流及下载重定向的通用参数解析器中，一旦发现请求的资源已被分享给当前用户，则**自动将 API Key 替换提权为配置的 `AdminApiKey`**，并自动重写请求头。使得后续所有向 Emby 服务器发起的物理路径查询及直链解析等，均能以管理员权限畅通运行，从而在底层让无权用户 B 像原生库一样实现完美流畅播放。

---

## 🔗 私有视频空间分享系统 (Frontend 对接)

### 1. 分享系统前端 API 封装 (`share.ts`)
* **文件路径**：`pelagica/frontend/src/api/share.ts`
* **变更目的**：对接 Go 代理端的私有分享 API，并添加 `try-catch` 容错，确保在 Go 后端未启动或失效时，前端不阻塞、不报错。
* **提供方法**：
  - `fetchUsers()` — 获取除当前用户外的用户列表
  - `createShare(mediaId, targetUserIds)` — 批量创建视频分享
  - `fetchMyShares(startIndex, limit)` — 分页拉取我发起的分享记录
  - `fetchSharedWithMe(startIndex, limit)` — 分页拉取共享给我的视频列表
  - `deleteShare(shareId)` — 取消分享

### 2. 视频详情页分享交互弹窗 (`ShareDialog.tsx`)
* **文件路径**：`pelagica/frontend/src/components/ShareDialog.tsx`
* **变更目的**：为影片/剧集详情页提供弹出式分享面板。
* **界面与逻辑**：
  - 加载可用用户列表，并以复选框列表展示。
  - 用户可勾选多个目标用户，点击“确认分享”批量创建。
  - 自动集成在电影 (`MoviePage.tsx`) 与电视剧/季 (`SeriesPage.tsx` / `SeasonPage.tsx`) 详情页的操作栏中。

### 3. 主导航侧边栏新增“共享库”入口 (`AppSidebar.tsx`)
* **文件路径**：`pelagica/frontend/src/components/AppSidebar.tsx`
* **功能**：在侧边栏中为所有已登录用户渲染一个名为“共享库 (Shared Library)”的菜单项，图标为 `FolderHeart`，链接至 `/shared-library`。

### 4. 专属共享库页面 (`SharedLibraryPage.tsx`)
* **文件路径**：`pelagica/frontend/src/pages/SharedLibrary/SharedLibraryPage.tsx`
* **功能**：展示他人分享给当前用户的视频列表。
  - 复用了 Library 网格框架，支持“海报网格”、“横版网格”和“列表模式”三种视图切换。
  - 支持完整的后端分页。
  - 内部自动捕捉 API 失败并优雅降级为空白页，防止阻滞前端运行。

### 5. 共享卡片专属标识与徽章 (`LibraryItem.tsx`)
* **文件路径**：`pelagica/frontend/src/pages/Library/LibraryItem.tsx`
* **变更目的**：在共享库网格中清晰标示该视频是谁分享的。
* **交互细节**：
  - 在卡片左上角（如果不是文件夹）或适当区域渲染一个磨砂高斯模糊黑色半透明的 **`ShareOwnerName`** 徽章，文字呈现为 `来自: {OwnerName}`，极大提升了多用户共享时的辨识度与高级感。

### 6. 设置页面改版与非管理员权限穿透 (`SettingsPage.tsx`)
* **文件路径**：`pelagica/frontend/src/pages/Settings/SettingsPage.tsx`
* **变更目的**：使用户能够管理自己发起的分享。
* **重构逻辑**：
  - 移除了原有的页面级管理员校验 `requireAdmin: true` 限制，使普通用户也能访问 `/settings`。
  - 内部进行了 Tab 级权限判定：普通用户仅显示“分享管理”一个标签页，所有系统级敏感的配置标签页（如“基础配置”、“转码配置”等）仅对管理员可见。
  - 在“分享管理”页面下支持分页展示“我发起的分享”列表，并提供一键“取消分享”功能。


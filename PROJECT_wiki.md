# PROJECT_wiki

本 Wiki 记录了本项目二次开发过程中新增或变更的公共工具、核心数据结构及重要技术决策，以便于维护与后续迭代。
本项目是二次开发，进行功能修改时，要求非侵入式开发，对于功能的大变更合并时的冲突要我决策取舍，而不是随意合并
---

## 🛠️ 公共工具与通用配置变更

### 1. Jellyfin 静态图片 URL 拼接服务 (`jellyfinUrls.ts`)与防双问号（?）参数拼接重构
* **文件路径**：`pelagica/frontend/src/utils/jellyfinUrls.ts`
* **变更目的**：
  1. 修复物理文件夹在缺失或默认 `tag` 下触发 Jellyfin 强行鉴权时产生的 `404 Not Found` 错误。
  2. 修复各组件在请求图片时手动通过模板字符串拼接 `?maxWidth=...` 导致生成带有两个问号的错误 URL 结构。
* **修改函数与接口**：
  - 新增并导出 `ImageSizeOptions` 接口，支持可选参数 `width`, `height`, `maxWidth`, `maxHeight`, `quality`。
  - 重构 `getBackdropUrl`、`getLogoUrl`、`getThumbUrl`、`getPrimaryImageUrl`、`getItemImageUrl` 的参数结构，统一接收 `ImageSizeOptions` 并在函数内使用标准的 `url.searchParams.set()` 对参数进行添加和覆盖，避免了在组件层做字符串拼接的繁琐逻辑。
* **接口变更详情**：
  在拼接以上静态图片 URL 时，鉴权参数名由非标的 `token` 修正为了标准的 **`api_key`**（为保持旧版向前兼容性，在 query 参数中同时携带了 `api_key` 和 `token`）。
  ```typescript
  // 修正与增强后的静态图片 URL 构建逻辑
  url.searchParams.set('api_key', token);
  url.searchParams.set('token', token);
  if (size?.maxWidth) url.searchParams.set('maxWidth', size.maxWidth.toString());
  if (size?.maxHeight) url.searchParams.set('maxHeight', size.maxHeight.toString());
  if (size?.quality) url.searchParams.set('quality', size.quality.toString());
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
  - 接口详述：提供了创建分享、我的分享、共享给我、取消分享、用户列表拉取等 6 个核心接口的详尽 JSON 输入输出示例。

### 8. 列表页缩略图同步下载与保存机制重构
* **文件路径**：
  - `internal/service/openlist/localtree/task.go`
  - `internal/service/openlist/localtree/synchronizer.go`
  - `internal/service/openlist/api.go`
* **变更目的**：修复原项目在播放视频时才异步下载缩略图的延迟滞后问题，实现**在列表页生成目录树 `.strm` 时自动下载同名 `.jpg` 封面**。
* **重构与防爆设计逻辑**：
  - **信息传递**：在 `FileTask` 结构体中加入 `Thumb` 属性，将在扫描 AList 列表页时获取到的原图 URL（`info.Thumb`）向上传递。
  - **Token 鉴权下载 (`DownloadThumb`)**：在 `api.go` 中新增 `DownloadThumb(thumbUrl, jpgPath)`。当下载 AList 图片直链时，自动在 HTTP 请求头添加 `Authorization: config.C.Openlist.Token` 头，解决部分云盘代理路径鉴权 401/403 导致无法下载的问题。
  - **详情回源兜底**：因 AList 列表 `/api/fs/list` 接口往往不返回文件 `thumb` 字段，若检测到列表中的 `task.Thumb` 为空，会由协程异步调用一次单文件详情接口 `openlist.FetchFsGet` 来获取真实的缩略图地址。
  - **防爆与缓存机制**：在列表页同步生成文件时，主动检测本地是否存在同名的 `.jpg` 封面。只有当图片文件不存在时，才会异步发起 AList API 详情查询与图片下载请求，最大限度地减少对 AList 接口的调用频率，防止网盘高频风控。
  - **完美同名同路径**：依据 localtree 生成器最终输出的 strm/虚拟文件物理地址，截取后缀并自动保存为同名 `.jpg` 封面，无缝适配 Emby 的本地封面刮削。

### 9. 智能日志控制与双斜线路由容错配置
* **文件路径**：
  - `internal/config/log.go`
  - `internal/web/log.go`
  - `internal/web/handler.go`
  - `config-example.yml`
  - `pelagica/frontend/src/api/share.ts`
* **变更目的**：
  - 彻底解决前端因服务器 URL 末尾斜线导致的 `//api/share` 双斜杠 404 接口请求；
  - 规范后端路由匹配：自动合并请求 URI 中 Path 部分的连续双斜杠为单斜杠；
  - 削减频繁的图片获取、播放进度轮询和 WebSocket 心跳成功日志给终端造成的噪声。
* **主要内容**：
  - **路径末尾清洗**：在前端 `share.ts` 发送请求前调用 `.replace(/\/$/, '')` 清洗配置的 ServerUrl 尾部斜杠。
  - **后端双斜杠容错**：在 `handler.go` 对 `RequestURI` 中的 path 字段进行重复斜线（`//`）清洗，重新组合后再进行正则规则匹配，保证 API 的稳健访问。
  - **CORS 与 OPTIONS 请求防闯入及本地 CORS 头注入**：在 `route.go` 中，对所有本地处理的分享 API 相关的 `shareMethodGuard` 和 `shareMethodRouter` 进行了优化，不仅在 `GET`、`POST`、`DELETE` 响应中通过 `setCORSHeaders` 注入跨域头，而且直接在本地处理 `OPTIONS` 预检请求并返回 `204`（不再转交给 Emby，避免源站返回不匹配的 `*` 导致 credentials 验证失败）。此外，在跨域响应头 `Access-Control-Allow-Headers` 中补充了 `X-Emby-Authorization` 头字段，彻底打通前端跨域数据请求。
  - **Verbose 控制模式**：默认 `verbose: false`。在 `log.go` 中内置对 `/images`, `/sessions/playing/`, `socket`, `subtitles`, `/web/` 成功（状态码 < 400）日志的自动过滤逻辑；同时支持在 YAML 中通过 `ignore-paths` 添加自定义过滤规则，既净化了日志刷屏，又保留了关键错误日志的可见性。

### 10. 跨权限媒体详情获取与用户 ID 缓存机制 (`share.go`)
* **文件路径**：`internal/service/share/share.go`
* **变更目的**：修复获取被分享媒体信息时，因直接请求不规范的 `/emby/Items/{ItemId}` 导致 Emby 官方服务器返回 `400 Bad Request`，最终导致被分享人看不到共享内容的严重 Bug。
* **重构与缓存设计详情**：
  - **路径规范化**：将请求路由修正为 Emby 官方标准的包含 UserId 路径：`/emby/Users/{UserId}/Items/{ItemId}`。
  - **管理员用户 ID 筛选与缓存 (getAdminUserId)**：在跨权限查询详情时，路径中的 `UserId` 必须对该媒体拥有访问权限。为在穿透鉴权时避开被分享人可能存在的媒体库访问限制，系统自动遍历 Emby 用户列表筛选出 `IsAdministrator == true` 的管理员用户 ID，并在内存中引入 `adminUserIdCache` 进行锁保护缓存，首次调用时获取，后续直接命中缓存，做到了零开销与高性能。

### 11. 干净的管理员 PlaybackInfo 后台代理机制 (`playbackinfo.go`)
* **文件路径**：`internal/service/emby/playbackinfo.go`
* **变更目的**：彻底重构简化共享视频的播放提权机制。抛弃了过去由于就地篡改客户端 `c.Request` 的各种请求头与参数所引起的巨大开发复杂度和容易导致 404/403 的高风险。
* **重构细节与决策**：
  - **解耦客户端请求**：不再试图修改客户端 `c.Request.Header`、`c.Request.URL.RawQuery` 等任何请求属性，保持其纯净与隔离性。
  - **纯净后台代理请求 (`fetchPlaybackInfoByAdmin`)**：当后端检测到当前播放请求属于已被分享的资源时，直接在后台通过标准 Go HTTP Client 组装一个全新的、只带管理员 `api_key` 和 `X-Emby-Token` 的纯净 POST 请求，向 Emby 源站换取该资源的 PlaybackInfo。
  - **直链改写与返回**：拿到 PlaybackInfo 响应后，继续使用管理员权限 and OpenList 解析出真实的网盘直链流地址，改写响应数据并最终吐给客户端。使得非原库所有者用户可以直接使用得到的直链流畅播放，实现高可靠与零污染提权。

### 12. 目录树同步过期清理保护机制（防止误删封面与元数据）
* **文件路径**：
  - `internal/service/openlist/localtree/synchronizer.go`
  - `internal/service/openlist/localtree/should_keep_file_test.go` (新增单元测试)
* **变更目的**：解决在列表页同步生成 `.strm` 文件且自动下载同名 `.jpg` 封面图后，由于图片不属于 remote AList 直接扫描出的媒体文件同步任务，而在过期文件比对中被误删的问题。同时保护本地 `.nfo` 刮削配置及手动放置的外挂字幕（`.srt`/`.ass`）。
* **保护机制实现**：
  - **后缀与父目录安全层**：限制仅针对 `.jpg`, `.jpeg`, `.png`, `.webp`, `.nfo`, `.xml`, `.srt`, `.ass` 等元数据/封面/字幕辅助文件类型启动保护；若其父目录本身已被删除，则仍会被正常清理。
  - **文件名智能过滤**：对文件名移除已知海报相关修饰后缀（如 `-poster`, `-fanart`, `-banner` 等）及多重后缀（如字幕的 `.zh-cn` 等语言标识码）。
  - **媒体回源检索**：在 `current` 实时快照中查找是否存在与该前缀同名、且以常用媒体后缀（如 `.strm`, `.mp4`, `.mkv`, `.mp3` 等）结尾的活跃媒体任务文件。若关联媒体文件依然存在，则保留本文件；若已彻底删除，则一并清理。

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

### 2. 继续播放缩略图 (16:9) 静态检查与动态回落机制 (`BaseContinueRow.tsx`)
* **文件路径**：`pelagica/frontend/src/pages/Home/BaseContinueRow.tsx`
* **设计目的**：
  解决“继续播放”列表中的视频由于服务端未生成/缺少 `Thumb` 缩略图导致图片加载 404 的问题。
* **回落判定与重试逻辑**：
  1. **静态标签检查**：在组件生成图片 URL 时，根据元数据中是否存在对应的 `ImageTags.Thumb` 和 `ImageTags.Backdrop` 标签来按优先级请求对应的图片类型，避免无脑请求不存在的缩略图接口。
  2. **动态加载回落**：
     - 普通电影优先请求 `Thumb`，剧集单集优先请求 `Primary`；
     - 若该首选请求在浏览器端加载失败（触发 `onError`），则组件会自动拦截错误并更新 `failedThumbs` 状态，触发重新渲染，并改向请求 `Backdrop`（背景图）或 `Primary`（主海报）；
     - 只有当备用回落图片也加载失败时，才会降级显示 `ImageOff` 的默认灰色占位图标。这保障了整个主页“继续播放”卡片墙的视觉完整度，彻底告别 404 图片裂开的难看效果。

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
  - **高度自适应保护 (`h-auto`)**：将 List 和 Grid 下的图片容器 `div` 升级，类名加入 **`h-auto`**（即 `height: auto`），强制要求高度完全由其纵横比和宽席裁剪填充，杜绝一切压扁拉伸变形！**

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
* **详情获取拦截 (`playbackinfo.go` - `LoadCacheItems` & `constant.go` - `Reg_UserItems`)**：
  在处理客户端获取详情请求时，拦截已被分享给当前用户的 `itemId`，不再直接向 Emby 转发。改为在后台调用管理员方法 `share.GetItemInfoByAdmin(itemId)` 穿透越权拉取元数据，高保真返回给无权用户 B。
  - **Jellyfin UUID 与非用户路径兼容性修复**：将 `constant.go` 中原有的 `Reg_UserItems` 拦截正则由纯数字 `\d+` 替换为可选 `users` 前缀加十六进制 `[0-9a-f]+`，以全面兼容 Jellyfin 的 UUID 格式，并同时支持 `/Users/{userId}/Items/{itemId}` 和直接的 `/Items/{itemId}` 两种获取媒体详情接口的路由匹配。
* **播放与重定向提权 (`media.go` - `resolveItemInfo` & `share.go` - `getRequestApiKey`)**：
  在播放、PlaybackInfo、串流及下载重定向的通用参数解析器中，一旦发现请求的资源已被分享给当前用户，则**自动将 API Key 替换提权为配置的 `AdminApiKey`**，并自动重写请求头。使得后续所有向 Emby 服务器发起的物理路径查询及直链解析等，均能以管理员权限畅通运行，从而在底层让无权用户 B 像原生库一样实现完美流畅播放。
* **详情与播放接口的 CORS 跨域与 OPTIONS 预检支持 (`cors.go` - `handleCORSAndOPTIONS`)**：
  由于被分享资源的详情获取（`/Items/{itemId}`）和播放直链（`/PlaybackInfo`）会在 Go 后端被直接拦截并由本地构建数据响应（不再透明回源），这会导致浏览器客户端在跨域访问时因缺失 CORS 响应头或 OPTIONS 预检失败而被浏览器拦截。为此在 `LoadCacheItems` 和 `TransferPlaybackInfo` 起始处引入了统一的 `handleCORSAndOPTIONS` 校验拦截器，自动响应 `OPTIONS` 预检（返回 `204`），并在本地响应中注入完整的 CORS 跨域头，确保前端流畅对接。
  - **X-Emby-Authorization 头支持与重写**：在 `share.go` 的 `getRequestApiKey(c)` 提取器中，新增了针对 `X-Emby-Authorization` 头部内 `Token="..."` 字样的提取解析；并在 `media.go` 的 `resolveItemInfo` 提权逻辑中，自动用正则替换重写请求头中 `X-Emby-Authorization` 和 `Authorization` 的 Token 值为 `AdminApiKey`。解决了前端因未传递 `X-Emby-Token` 以及透传了低权限 Token 到源站而导致 `PlaybackInfo` 返回 404 的重大鉴权死结。
* **共享资源图片与字幕提权机制 (`emby.go` - `HandleImages` & `subtitles.go` - `ProxySubtitles`)**：
  在处理外部字幕拉取（`/videos/{itemId}/{mediaSourceId}/Subtitles/...`）和图片/封面拉取（`/Items/{itemId}/Images/...`）等媒体附属资源请求时，如果系统判定请求的媒体属于已分享资源且当前用户有权访问，系统会在代理回源前**自动将请求 API Key 及各类鉴权 Header 提权替换为 `AdminApiKey`**（由统一辅助方法 `TryElevateSharedResourceCredentials` 驱动），彻底解决了被分享人看共享视频时“封面加载 404”及“字幕加载 401”的越权阻碍。

---

## 🔗 私有视频空间分享系统 (Frontend 对接)

### 1. 分享系统前端 API 封装与详情端点及辅助接口规范化 (`share.ts` & `usePlayerItem.ts` & `useMediaSegments.ts` & `useAdjacentItems.ts`)
* **文件路径**：
  - `pelagica/frontend/src/api/share.ts`
  - `pelagica/frontend/src/hooks/api/usePlayerItem.ts`
  - `pelagica/frontend/src/hooks/api/useMediaSegments.ts`
  - `pelagica/frontend/src/hooks/api/useAdjacentItems.ts`
* **变更目的**：对接 Go 代理端的私有分享 API，并规范播放页获取详情的 API 端点以确保能被后端代理规则正确拦截，同时对播放页面的辅助性 API 接口进行防御性防爆容错，避免原厂 404 权限阻碍播放。
* **变更详情**：
  - `share.ts` 中提供 `fetchUsers`、`createShare`、`fetchMyShares`、`fetchSharedWithMe` 及 `deleteShare` 服务。
  - **接口请求端点拦截匹配规范**：将 `usePlayerItem.ts` 获取媒体详情的逻辑，由生成 query 参数格式（`/Items?Ids=...`）的 `getItemsApi.getItems` 重构为生成物理路径参数格式（`/Users/{userId}/Items/{itemId}`） of `getUserLibraryApi.getItem`。此技术调整能确保前端请求完美触发后端的 `Reg_UserItems` 正则路由，使共享提权逻辑得以正常工作。
  - **播放辅助 API 防爆容错机制**：在 `useMediaSegments.ts`（获取章节/片头片尾片段）以及 `useAdjacentItems.ts`（获取剧集邻近下一集）中，全面引入 `try-catch` 包裹。如果因为播放共享资源而导致这两个辅助接口被原厂鉴权拦截返回 `404 Not Found` 时，系统将静默吞掉报错并降级返回空数据，彻底消灭前端 `Error loading item: Request failed with status code 404` 的阻断错误。

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

---

### 13. 彻底禁用网盘端强转码，修复本地直连代理 404 及多浏览器兼容转码 (`PlayerPage.tsx` & `redirect.go`)
* **文件路径**：
  - 前端：`pelagica/frontend/src/pages/Player/PlayerPage.tsx`
  - 后端：`internal/service/emby/redirect.go`
* **变更目的**：修复本地常规视频在直接播放原画文件时发生 404 无法播放的 Bug，同时保证本地不兼容媒体在非 Chrome 浏览器（如 Safari/Firefox）下自适应走 HLS 转码，且网盘视频（`.strm`）依然保持直链免转码播放。
* **技术决策与变更详情**：
  - **后端 original 回源路由修复**：由于 Emby 官方并不存在 `/original` 接口，在 `redirect.go` 的 `ProxyOriginalResource` 代理本地视频回源前，自动将 URI 中的 `original` 字段替换回原生的 `stream`，使 Emby 能正确响应 206 原文件流数据，彻底消灭本地原画直链 404。
  - **云盘/本地自适应分流判定**：前端检测 `Path` 属性进行分类流播：
    - **网盘挂载资源（以 .strm 结尾）**：为了强力禁止网页端强行发起转码切片，强制 `supportsDirect = true`，走 `getStaticStreamUrl` 实现 302 重定向到网盘原画播放。
    - **本地常规资源（非 .strm 结尾）**：尊重官方的 `SupportsDirectPlay` 属性判定。如果浏览器兼容（例如 Chrome 播放 MP4），优先直接播放原文件（Static 方式中转并由后端还原路由代理）；如果不兼容（例如 Safari 播放本地 MKV），自动回退走 `getVideoStreamUrl`，触发 Emby 原生 HLS 转码，以防出现“格式不支持”报错。

### 14. Pelagica 后端路由级反向代理与进程生命周期管理
* **文件路径**：
  - 配置：`internal/config/ge2o.go`
  - 常量：`internal/constant/constant.go`
  - 路由及处理器：`internal/web/route.go`, `internal/web/handler.go`, `internal/service/emby/pelagica.go`
  - 启动入口：`main.go`
  - CI/CD及容器编排：`Dockerfile.unified`, `docker-compose.yml`, `.github/workflows/docker.yml`, `.gitignore`
* **变更目的**：实现 `go-emby2openlist` 代理后端与 Pelagica 后端（Fiber）和前端静态网页的一体化低阻碍融合。
* **重构与防冲突设计详情**：
  - **路由拦截桥接 (`ProxyPelagica`)**：在 `internal/web/route.go` 的正则路由拦截规则末尾（分享 API 之后，Emby 根路径之前）注册了 `Reg_PelagicaAPI = "^/api/.*"` 规则。除了系统自身的 `/api/share` 接口外，其余所有的主题、品牌及系统配置接口（`/api/config`, `/api/themes`, `/api/branding`, `/api/studios`）都会被拦截并利用 `httputil.NewSingleHostReverseProxy` 透明转发到后台静默运行的 `pelagica-backend`。
  - **静态网页托管与 SPA 路由劫持 (`servePelagicaStatic`)**：在 `globalDftHandler` 开始处拦截非 API/WebSocket/EmbyWeb 资源请求。如果指定了 `ge2o.pelagica-frontend-dir` 静态目录，若本地存在文件则直接服务静态资产，若属于主要 SPA 路径（`/settings`、`/library` 等）则自动响应 `index.html` 完美唤醒 React Router。而普通的 Emby 界面请求（以 `/web` 开头）与 API 依旧可以照常穿透至源服务器，实现“访问根目录访问 Pelagica，访问 /web 访问原厂后台”的清爽互补格局。
  - **子进程守护管理 (`StartPelagicaBackend`)**：在主程序启动时，根据配置参数（`start-pelagica-backend: true`）通过 `exec.Command` 在后台以子进程静默拉起 `pelagica-backend.exe`，自动传递 `PORT=4321` 及缓存目录等环境变量。在主程序捕获中断信号（`Ctrl+C`, `SIGINT`, `SIGTERM`）退出时，主进程延迟优雅清理并强力调用 `Kill()` 停止子进程，杜绝僵尸进程污染。
  - **CI/CD 及容器编排 (Dockerfile.unified & docker.yml & docker-compose.yml)**：新增支持多阶段构建的统一 Dockerfile，利用 GitHub Actions 的云端 pnpm 编译缓存，可在数秒内完成主程序编译，并在 1.5 分钟内通过 Actions 完成前端编译及多阶段统一镜像（unified）构建与自动推送；同时重构根目录下的 `docker-compose.yml` 引入了一键拉起三合一融合版镜像的服务配置，得益于一体化数据结构，用户只需映射单一的 `/config` 挂载目录便能安全归档并持久化代理配置、分享数据库及 Pelagica 配置、主题等所有数据，极大降低了用户部署门槛。

### 15. 详情页外部播放器唤起按钮 (`ExternalPlayerButton.tsx`)
* **文件路径**：
  - 前端组件：`pelagica/frontend/src/components/ExternalPlayerButton.tsx` (新增)
  - 详情页：`pelagica/frontend/src/pages/Item/MoviePage.tsx` & `pelagica/frontend/src/pages/Item/EpisodePage.tsx` (修改)
* **变更目的**：为移动端（特别是 Android）及桌面端用户提供在详情页直接调用第三方播放器（如 VLC, MX Player, Infuse, PotPlayer, nPlayer, Reex 等）的播放通道，并实现无缝续播和外置字幕自动匹配挂载。
* **技术设计与功能**：
  - **设备系统 UA 识别**：智能解析客户端 User Agent。Android 展现 Android 支持的播放器列表；iOS 展现 iOS 支持的播放器列表；桌面端（Windows/Mac）展现 PotPlayer/IINA/VLC 列表。
  - **无缝续播进度传递**：获取影片的用户进度字段 `PlaybackPositionTicks`，除以 10000 转换为毫秒（ms），以 `i.position` 附加在 Android Intent 协议中；在 Windows PotPlayer 协议中则转为 `HH:MM:SS` 格式附加在 `/seek` 中，实现三方播放器续播。
  - **智能外置字幕挂载**：解析媒体流信息 `MediaStreams`，过滤外置字幕，优先选取匹配中文字幕，并将对应的字幕直链格式（SRT/VTT）通过协议参数（如 Android VLC 的 `subtitles_location`、iOS Infuse 的 `sub`）传递给支持外置字幕的播放器。
  - **直链复制与交互反馈**：播放直链默认使用 Static 直链，并支持一键复制到剪贴板，使用 `sonner` 实现 Toast 气泡交互反馈。

### 16. Pelagica 官方上游合并与功能建议文档 (`UPSTREAM_SUGGESTIONS.md`)
* **文件路径**：[`pelagica/UPSTREAM_SUGGESTIONS.md`](file:///d:/Users/Documents/1/emby2openlist/pelagica/UPSTREAM_SUGGESTIONS.md) (新增)
* **变更目的**：为本地定制开发的多项功能（除“分享管理”外）整理成详尽的建议书，提供用户痛点分析、给官方的改进建议和具体技术选型思路，方便后续向上游提交 PR 或上游自行实现时作为高质量的设计参考。
* **涵盖功能建议**：
  1. 媒体库文件夹树状深度导航与视图模式（Poster/Backdrop/List）记忆。
  2. 通用外部播放器唤起协议（PotPlayer/VLC/Infuse等）及续播、外挂字幕传递。
  3. 封面图防挤压自适应（真实比例计算）及 Thumb/Backdrop/Primary 图片降级加载链。
  4. 桌面端卡片悬停一键播放交互。
  5. 客户端有权用户手动触发 Jellyfin 元数据刷新。
  6. 播放控制条布局重构（时间移位）、音量滑出收纳、倍速播放记忆、全屏横屏重力锁。
  7. 视频硬解指示器（HW/SW）、外挂特效字幕大括号代码清洗与字幕统一样式、STRM 文件强制直流播放。
  8. 智能级联返回按钮与详情页封面大图点击播放交互。
  9. 中文官方本地化资源文件合入。
  10. 登录页服务器 IP 与端口分立输入和当前 Host 智能预填。
  11. 媒体库网格中“标题”与“文件名”模式的全局即时同步切换。
  12. 离线/局域网内网环境下统计同意弹窗免阻塞优化。

### 17. Pelagica 二开手动合并方案与功能差异指南 (`UPSTREAM_MERGE_GUIDE.md`)
* **文件路径**：[`UPSTREAM_MERGE_GUIDE.md`](file:///d:/Users/Documents/1/emby2openlist/UPSTREAM_MERGE_GUIDE.md) (新增)
* **变更目的**：由于本地对前端项目进行了深度定制（如汉化、倍速、外置播放器、共享库等），为避免未来直接 merge 官方上游造成功能丢失或冲突，特制定此手动比对合并指南。
* **主要内容**：
  - 详细列出了二开功能核心影响的受灾文件（如 `VideoPlayer.tsx`、`LoginPage.tsx`、`SettingsPage.tsx`、`LibraryPage.tsx` 等）与二开差异。
  - 给出了每个功能模块在合并时的重点审查点和代码保留指南。
  - 规定了分步式手动合并操作规范（从环境准备、文件比对到构建校验、dev.sh 联调测试），为后续维护与代码拉取提供安全机制。

## 5. 插件扩展系统 (2026-08-08 重构)
* **核心结构变更**：引入了全新的插件化解耦机制，用于隔离二开（二次开发）逻辑，摆脱每次合并上游代码导致的大量冲突。
* **文件路径**：`internal/plugin/` 以及对 `internal/web/route.go`、`internal/service/openlist/api.go`、`internal/config/config.go` 的插槽拓展。
* **主要插槽 (Slots & Hooks)**：
  - **路由优先级注册 (`web.ExtraRules`)**：通过 `web.RegisterExtraRule(pattern, handler, priority)` 提供无侵入式 Gin 路由注册机制。系统在编译路由前会自动按 `priority` 降序排列。该机制确保了高优先级精确路由（如 `/api/share`）不会被低优先级的宽泛匹配规则（如 Pelagica网关 `^/api/.*`）错误拦截。
  - **配置加载完成钩子 (`config.OnConfigLoadedHooks`)**：插件通过此钩子可以在系统 `config.yml` 完全解析且运行路径确立后，再安全地执行初始化逻辑。彻底解决了利用 Go 自带 `init()` 函数初始化过早导致的依赖错乱或目录定位失败（比如 `shares.json` 生成路径错误）问题。
  - **生命周期钩子 (`openlist.AfterFsGetHooks`)**：允许插件挂载业务生命周期事件，例如在文件资源获取后异步触发缩略图处理任务。
* **现有核心插件**：
  - `thumbnail/365_thumb.go`：挂载 `AfterFsGetHooks`，自动下载缩略图。
  - `share/share_route.go`：挂载 `OnConfigLoadedHooks` 执行安全初始化，并挂载高优先级 `100` 的分享系统路由拦截器。
  - `pelagica/pelagica_route.go`：挂载优先级 `50` 的前端反代网关通配符路由。

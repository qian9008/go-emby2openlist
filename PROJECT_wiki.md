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

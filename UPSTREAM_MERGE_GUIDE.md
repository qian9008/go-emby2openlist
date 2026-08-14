# Pelagica 本地二开手动合并指南 (UPSTREAM_MERGE_GUIDE.md)

为了防止官方上游（Upstream）更新时通过自动 Git 合并（如 `git merge`）冲掉或遗漏本地的定制化二次开发功能，本项目后续**必须采用手动比对、打补丁式的增量合并方案**。

本指南详细对比了本地 `dev` 分支与上游 `upstream/main` 分支在业务功能层面的差异，列出了所有涉及的核心文件，并给出了精准的手动合并规范。

---

## 一、 合并基本策略与工具推荐

### 1. 为什么禁止直接使用 `git merge`？
- **多处核心文件冲突**：本地对播放器、登录页、详情页等关键组件进行了多处业务侵入式的修改，自动合并会导致代码错乱或直接丢失本地二开特性。
- **构建环境与框架差异**：本地移除了 wails 桌面端（Wails Desktop）构建，如果直接合并上游，会重新带入已被清理的桌面端绑定代码，导致构建链失败。
- **自定义路由与接口**：本地共享库和分享管理挂载在主项目的 Go 反代服务上，自动合并会打乱路由表和 API 鉴权拦截。

### 2. 推荐合并工具
- **三方比对工具**：Beyond Compare 4、Meld 或 KDiff3（适合逐行、逐块对比差异）。
- **IDE 内置 Diff**：VS Code 的 GitLens 与三向合并冲突解决程序（3-Way Merge Editor）。

---

## 二、 核心功能差异与受灾文件对比清单

以下列出各个二次开发功能模块所影响的文件，在手动比对合并时必须逐一排查。

### 1. 播放器基础交互与控制增强 (Player Controls)
* **核心文件**：
  - [`pelagica/frontend/src/pages/Player/PlayerControls.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Player/PlayerControls.tsx)
  - [`pelagica/frontend/src/pages/Player/PlayerPage.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Player/PlayerPage.tsx)
* **二开差异**：
  - 进度条左右两端显示当前时间/总时长，删除了原播放/暂停键旁边的重复时间显示。
  - 音量条重构为“鼠标悬停/触摸滑出式”，移开后自动收回，点击静音。
  - 新增播放速度（0.5x ~ 2.0x）下拉控制，且切换下一集/流时自动通过本地存储记忆并维持速度。
  - 利用 API 返回的 `RunTimeTicks` 预设时长，解决初始显示 `0:00` 并伴随闪烁的 Bug。
* **手动合并注意**：
  - 上游若修改了播放器控制栏组件的底层 DOM，需保留本地的倍速下拉菜单组件和音量悬浮展开的 CSS/JS 逻辑。

### 2. 视频硬解指示器、字幕清理与 STRM 强制直流播放
* **核心文件**：
  - [`pelagica/frontend/src/pages/Player/VideoPlayer.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Player/VideoPlayer.tsx)
* **二开差异**：
  - **HW/SW指示器**：播放器右上角悬浮绿色 `HW`（硬解）或橙色 `SW`（软解）标识，利用 `navigator.mediaCapabilities` API 探测。
  - **特效字幕清洗**：解析外挂字幕文本时，通过正则过滤剥离 `{\fn...}` 等大括号特殊样式代码，防止浏览器渲染为一堆乱码。
  - **自定义字幕样式**：字幕添加透明背景，洋红色（`#ff00ff`）描边，配合黑色投影。
  - **STRM免转码直通**：当播放 `.strm` 文件时直接生成 Static 直流 URL，避免触发 Jellyfin 服务器的高负载转码。
* **手动合并注意**：
  - 这是最关键的冲突文件。上游若有升级，建议保留上游 `VideoPlayer.tsx` 的基础播放生命周期控制，将本地的“硬解检测”、“字幕正则清洗（在 TextTrack 或字幕加载事件中）”、“字幕自定义 CSS”及“strm 静态重定向”代码段以 Patch 形式重新插入。

### 3. 详情页智能返回按钮与封面交互增强
* **核心文件**：
  - [`pelagica/frontend/src/pages/Item/ItemPage.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Item/ItemPage.tsx)
  - [`pelagica/frontend/src/pages/Item/MoviePage.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Item/MoviePage.tsx)
  - [`pelagica/frontend/src/pages/Item/EpisodePage.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Item/EpisodePage.tsx)
  - 新增文件：[`pelagica/frontend/src/pages/Item/ItemBackButton.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Item/ItemBackButton.tsx)
* **二开差异**：
  - 详情页左上角悬浮的智能返回按钮（冷启动无浏览器历史时，根据 item 属性逐级回退：单集 -> 季 -> 剧集 -> 媒体库）。
  - 封面大图点击可直接触发播放，鼠标悬停时中央出现圆形半透明播放图标。
  - 自适应封面图物理宽高比例，避免非 2:3 海报发生拉伸或变形。
* **手动合并注意**：
  - `ItemBackButton.tsx` 是纯新增文件，直接拷贝即可。
  - 上游若重构详情页，请在新页面的外层 Layout 挂载 `ItemBackButton`，并在封面图的容器上重新绑定点击播放事件，以及保留利用真实宽高计算 `aspectRatio` 的逻辑。

### 4. 媒体库文件夹视图与网格/列表模式切换
* **核心文件**：
  - [`pelagica/frontend/src/pages/Library/LibraryPage.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Library/LibraryPage.tsx)
  - [`pelagica/frontend/src/pages/Library/LibraryItem.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Library/LibraryItem.tsx)
* **二开差异**：
  - 修复了进入深层文件夹再返回上一级目录时，历史路由栈造成死循环的 Bug。
  - 支持“海报网格 (Poster)”、“横版网格 (Backdrop)”、“单行列表 (List)”三种视图模式自由切换与 localStorage 记忆。
* **手动合并注意**：
  - 仔细对比 `LibraryPage.tsx` 的面包屑和路由后退导航逻辑，避免覆盖本地解决死循环的方案。
  - 保留卡片列表的渲染分支逻辑（即针对不同视图模式，传入不同的 Card Style 类名或使用不同的布局组件）。

### 5. 登录页分立 IP/端口输入
* **核心文件**：
  - [`pelagica/frontend/src/pages/Login/LoginPage.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Login/LoginPage.tsx)
* **二开差异**：
  - 将原单地址框拆分为独立的 IP 输入框与端口输入框，更加符合国内用户习惯，防止写错协议头或漏写冒号。
  - 开发环境下（`import.meta.env.DEV`）自动截取并填入当前浏览器的 `window.location.hostname`。
* **手动合并注意**：
  - 如果上游更改了登录页，在手动合并时，需确保由两个输入框拼装出完整的 `http://${ip}:${port}` 或 `https://...` 字符串后，再传给 Jellyfin 登录 API。

### 6. 完整中文本地化 (Chinese i18n)
* **核心文件**：
  - 新增文件夹：`pelagica/frontend/src/locales/zh/` （共 10 个 JSON 文件）
  - [`pelagica/frontend/src/i18n.ts`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/i18n.ts)
  - [`pelagica/frontend/src/components/NavUser.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/components/NavUser.tsx)
* **二开差异**：
  - 提供了完整的中文简体翻译语言包。
  - 强行修改了首发初始化逻辑：若用户未手动指定，默认将 `'zh'` 预设到 localStorage 的 `i18nextLng` 中。
* **手动合并注意**：
  - 直接拷贝 `locales/zh` 整个目录。
  - 在 `i18n.ts` 中检查是否有 `zh` 的加载注册代码。若上游版本添加了新的多语言资源配置方式，需手动补上 `zh` 及默认中文兜底。

### 7. 外部播放器调用 (PotPlayer/VLC等)
* **核心文件**：
  - 新增文件：[`pelagica/frontend/src/components/ExternalPlayerButton.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/components/ExternalPlayerButton.tsx)
  - 挂载文件：`MoviePage.tsx` 和 `EpisodePage.tsx`
* **二开差异**：
  - 详情页提供额外的“外部播放”按钮，一键通过自定义协议（如 `potplayer://`）拉起外部高性能解调器。
  - 智能匹配外置中文字幕并传参，且附带播放历史续播位置参数。
* **手动合并注意**：
  - 直接保留 `ExternalPlayerButton.tsx` 及其调用的脚本。在合并详情页时，将该组件以 Button 形式嵌入到原生“播放”按钮同一层操作栏。

### 8. 专属共享库与分享管理功能 (Share & Shared Library)
* **核心文件**：
  - 新增文件：[`pelagica/frontend/src/pages/SharedLibrary/SharedLibraryPage.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/SharedLibrary/SharedLibraryPage.tsx)
  - 新增文件：[`pelagica/frontend/src/components/ShareDialog.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/components/ShareDialog.tsx)
  - 修改文件：[`pelagica/frontend/src/components/AppSidebar.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/components/AppSidebar.tsx)
  - 修改文件：[`pelagica/frontend/src/main.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/main.tsx)
  - 修改文件：[`pelagica/frontend/src/pages/Settings/SettingsPage.tsx`](file:///d:/Users/Documents/1/emby2openlist/pelagica/frontend/src/pages/Settings/SettingsPage.tsx)
* **二开差异**：
  - 前端完整的“共享库”和“分享面板”业务闭环。
  - 侧边栏和主路由（`/shared-library`）的特有注册。
  - 普通用户也可以访问设置页进行“分享管理”（去除了原有 SettingsPage 的全局 admin 权限拦截，改用页内 Tab 级拦截）。
* **手动合并注意**：
  - 这些文件的大部分是**本地纯新增文件**，直接拷贝。
  - 特别注意：**合并 `main.tsx` 和 `AppSidebar.tsx` 时**，不要漏掉本地注册的路由和侧边栏菜单入口。
  - **合并 `SettingsPage.tsx` 时**，必须保留普通用户访问权限和页内 Tab 差异化拦截逻辑，不能覆盖为上游仅限 Admin 访问的原版。

---

## 三、 分步式手动合并操作规范

当你需要同步上游的最新主线时，应当遵循以下 5 个步骤进行操作：

### 步骤 1：准备干净的工作区与上游对比分支
在 `pelagica` 文件夹内：
```bash
# 1. 确保本地所有修改都已 Commit 干净
git status

# 2. 从官方拉取最新的分支数据
git fetch upstream

# 3. 基于 upstream/main 创建一个临时比对分支，用来存放没有二开的上游纯正新代码
git checkout -b temp-upstream-compare upstream/main
```

### 步骤 2：对非冲突文件/纯新增文件进行拷贝迁移
切换回你的本地开发分支 `dev`：
```bash
git checkout dev
```
将那些本地“特有”且上游绝对没有的文件列表进行核对备份，若上游分支没有这些文件，它们会自动保留；但若上游对某些文件名进行了重构（例如，上游调整了文件结构目录），应将这些纯二开文件放到新的对应目录下。

### 步骤 3：逐个比对并合并核心冲突文件
针对下列被双重修改的文件：
- `VideoPlayer.tsx`
- `PlayerPage.tsx`
- `LoginPage.tsx`
- `SettingsPage.tsx`
- `LibraryPage.tsx`

**推荐操作**：
1. 用 VS Code 或者是三方比对工具，左边放 `temp-upstream-compare` 分支的对应文件（纯上游新代码），右边放 `dev` 分支的对应文件。
2. 以左边（上游最新版）为基准，观察它做出了哪些功能修复或性能优化。
3. **手动、逐块**将右边（本地二开版本）的定制代码段拷贝粘贴到左边文件的对应上下文中。
4. 将合并好二开功能的新文件，覆盖写入到本地开发工作区中。

### 步骤 4：校验本地构建与一键测试
二开代码手动搬移完毕后，进入前端根目录：
```bash
# 安装依赖，检测是否有 package.json 或 lock 变动
pnpm install

# 触发 TypeScript 类型校验与 ESLint 检查，这能直接定位出二开的属性是否在新的上游类型定义下报错
pnpm build
```
若有编译报错，重点查看 TypeScript 报错的文件行。大多数是因为上游在底层 API 或组件 Props 签名上进行了改动，根据合并指南调整二开的入参签名即可。

### 步骤 5：启动本地一键联调
确认前端编译无报错后，运行以下脚本启动本地前后端联合调试，重点复查二开功能是否正常运行：
```bash
./dev.sh
```
测试无误后，将手动合并的修改提交 Commit，并推送到你自己的远程分支：
```bash
git add .
git commit -m "merge: 手动合并上游最新修改并保留所有本地二开功能"
git push origin dev
```

# 上游合并冲突预演报告

> 生成时间：2026-10-18
> 操作：将 `upstream/main`（原作者 AmbitiousJun/go-emby2openlist）合并进本地 `dev` 分支
> 方法：无副作用预演（实际 `--no-commit` 合并到工作区统计冲突段后 `--abort` 还原，工作区已确认干净）

## 一、合并背景

| 对象 | 说明 |
|---|---|
| 你的仓库 (origin) | `https://github.com/qian9008/go-emby2openlist` |
| 上游 (upstream) | `https://github.com/AmbitiousJun/go-emby2openlist` |
| 共同祖先 (merge-base) | `4159c46 doc: update README.md`（上次合上游的落点） |
| dev 侧相对祖先的提交 | 12 个（你的二开：分享/插件/缩略图/Pelagica 子模块/Docker 等） |
| upstream/main 侧相对祖先的提交 | 16 个（上游新发 `v2.9.0`、`v2.8.2`） |

结论：**这是一次"双向分叉"合并，不是 fast-forward**。你本地有 12 个二开提交，上游有 16 个新提交，必须手动解决冲突。

## 二、冲突总览

### 2.1 真正内容冲突（必须手动解）—— 5 个文件

| 文件 | 冲突段数 | dev 改动量 | upstream 改动量 | 冲突成因 |
|---|---|---|---|---|
| `README.md` | 4 段 | 743 行（大幅重写二开文档） | 14 行 | dev 重写了 README 结构，upstream 也调整了 README，区段重叠 |
| `config-example.yml` | 6 段 | 70 行（二开配置项） | 12 行（trusted-proxies 等） | 两边都在文件同区域增删配置项，key 可能重复 |
| `internal/config/ge2o.go` | 2 段 | 32 行 | 9 行 | upstream 新增 `trusted-proxies` 配置字段，与 dev 的配置结构改动同区 |
| `internal/service/emby/emby.go` | 3 段 | 75 行（分享拦截中间件） | 45 行（images-original 等） | Emby 核心文件，两边都在改同一批函数 |
| `internal/service/emby/redirect.go` | **1 段（最高风险）** | 4 行（share 拦截） | **66 行（本地媒体重定向重写 + 内存泄漏修复）** | upstream 重写了本地媒体重定向逻辑，dev 也改了 redirect 函数，重叠点直接冲突 |

### 2.2 Git 自动合并成功 —— 但仍需人工验证语义（5 个文件）

这些文件 Git 能自动合并不报冲突，但 dev 与 upstream 的改动可能逻辑重叠，合并后**可能编译通过但行为错误**：

| 文件 | dev 改动 | upstream 改动 | 验证重点 |
|---|---|---|---|
| `internal/service/openlist/localtree/synchronizer.go` | 144 行（性能优化） | 14 行（Fetch 加 timeout） | dev 的同步优化是否依赖 upstream 改过的 Fetch 函数？timeout 是否覆盖 dev 的同步路径 |
| `internal/service/openlist/api.go` | 84 行（二开代理/分享 API） | 13 行 | upstream 结构微调是否破坏 dev 的 API 改造 |
| `internal/service/lib/ffmpeg/ffmpeg.go` | 25 行（自定义 ffmpeg 路径） | 11 行 | 自动合后执行调用逻辑是否一致 |
| `internal/config/emby.go` | 4 行 | 4 行 | 小改动，风险低 |
| `internal/constant/constant.go` | 16 行 | 4 行 | 常量定义是否重复/覆盖 |

### 2.3 不冲突但需留意

- **`pelagica` 子模块**：dev 独有，upstream 未动，合并后保留 dev 版本，无冲突。
  - ⚠️ 但当前工作区 `pelagica` 子模块存在 `+912de16f` **未提交偏移**（本地检出 commit 与父仓库记录指针不一致）。合并前必须先决定：是提交这个指针，还是 `git submodule update` 回退到记录值。否则后续提交会把这个偏移带进去。
  - 合并后务必执行 `git submodule update --init --recursive` 确认子模块状态。
- 其余 dev 独有文件（分享服务、插件系统、缩略图插件等 2 开逻辑）均为 upstream 未触碰，自动保留。

## 三、解冲突优先级建议

1. **P0 — `internal/service/emby/redirect.go`**：本地媒体播放关键路径，upstream 修复了内存泄漏并优化重定向。不能简单取一边，需读懂两边后重写该函数，保留 dev 的 share 拦截 + 吸收 upstream 的内存泄漏修复与重定向条件优化。
2. **P0 — `internal/service/openlist/localtree/synchronizer.go`**（虽自动合）：确认 dev 性能优化与 upstream 的 Fetch timeout 兼容，否则本地文件树同步可能卡死或超时失效。
3. **P1 — `internal/service/emby/emby.go`**：保留 dev 的播放拦截中间件，并入 upstream 的 `images-original` 等新功能。
4. **P1 — `internal/config/ge2o.go` + `config-example.yml`**：把 upstream 的 `trusted-proxies` 配置字段并入 dev 的配置体系，避免重复 key。
5. **P2 — `README.md`**：以 dev 的二开文档为主，手动并入 upstream 新增的说明段落。

## 四、建议执行步骤（需你确认后再动手）

1. 先处理 `pelagica` 子模块偏移（提交指针或回退），保证工作区只有这一处预期脏状态。
2. 在 `dev` 上：`git fetch upstream && git merge upstream/main`（会停在有冲突处）。
3. 按 P0→P2 顺序解决上述 5 个冲突文件 + 验证 5 个自动合并文件。
4. 本地编译 `go build ./...` + 启动验证核心功能（分享播放、本地媒体重定向、文件树同步）。
5. 确认无误后 `git commit` 完成合并，`git push origin dev`。
6. **暂不动 main**，等 dev 验证稳定后再按之前方案快进/合并回 main。

---
> 本报告为预演产物，未对任何分支做实际提交。工作区已还原至合并前状态（仅保留 `pelagica` 子模块既有偏移）。

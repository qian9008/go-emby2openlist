package localtree

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/lib/ffmpeg"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/openlist"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/files"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs/colors"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/trys"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/urls"
	"golang.org/x/sync/errgroup"
)

// Synchronizer 同步远程 openlist 信息为本地磁盘目录树
type Synchronizer struct {
	// snapshot 同步过程中, 实时维护快照信息
	snapshot Snapshot

	// baseDir 本地目录树生成根路径
	baseDir string

	// pageSize 分页请求每页大小
	pageSize int

	// ctx 控制子任务执行和及时退出
	ctx context.Context

	// eg 并发同步的执行组
	eg *errgroup.Group

	// toSyncTasks 每次同步时的待处理子任务存放通道
	toSyncTasks chan []FileTask

	// activeTaskCount 记录 BFS 遍历过程中的活跃任务数
	activeTaskCount int32

	// threadsSem 控制同步任务的并发线程数
	threadsSem chan struct{}

	// hasScanTotal 当前已扫描到的总任务数
	hasScanTotal int64

	// hasScanFinish 当前已处理完成的任务数
	hasScanFinish int64

	// apiRefreshFlag 标记是否需要强制刷新远程缓存
	apiRefreshFlag bool

	sync.Mutex
}

// NewSynchronizer 指定目录树根路径 初始化一个同步器
func NewSynchronizer(baseDir string, pageSize int) *Synchronizer {
	return &Synchronizer{
		baseDir:     baseDir,
		pageSize:    pageSize,
		toSyncTasks: make(chan []FileTask, 1024),
	}
}

// Sync 触发一次同步操作
func (s *Synchronizer) Sync(prefix string, apiRefreshFlag bool) (total, added, deleted int, err error) {
	if !s.TryLock() {
		return 0, 0, 0, fmt.Errorf("当前正在执行同步任务")
	}
	defer s.Unlock()
	s.apiRefreshFlag = apiRefreshFlag

	if err := s.InitSnapshot(prefix); err != nil {
		return 0, 0, 0, fmt.Errorf("初始化快照异常: %w", err)
	}

	// 初始化状态
	s.toSyncTasks = make(chan []FileTask, 1024)
	okTaskChan := make(chan FileTask, 1024)
	s.eg, s.ctx = errgroup.WithContext(context.Background())
	s.threadsSem = make(chan struct{}, config.C.Openlist.LocalTreeGen.Threads)
	s.hasScanFinish, s.hasScanTotal = 0, 0

	// 每隔固定时间输出一下当前的同步进度
	ticker := time.NewTicker(time.Second * 10)
	defer ticker.Stop()
	go func() {
		for range ticker.C {
			var percent float64
			if s.hasScanTotal > 0 {
				percent = float64(s.hasScanFinish) / float64(s.hasScanTotal)
			}
			logf(colors.Purple, "预估同步进度 (已扫描/已发现任务数) => %d/%d (%.2f%%)", s.hasScanFinish, s.hasScanTotal, percent*100)
		}
	}()

	// 读取根目录放置到任务通道中
	s.activeTaskCount = 0
	if err := s.walkDir2SyncTasks(prefix); err != nil {
		return 0, 0, 0, fmt.Errorf("获取 openlist 根目录异常: %w", err)
	}

	// 执行同步任务
	go s.handleSyncTasks(okTaskChan)

	// 更新快照和目录树
	s.eg.Go(func() error {
		s.updateLocalTree(okTaskChan, &total, &added, &deleted)
		return nil
	})

	// 等待任务完成
	if err := s.eg.Wait(); err != nil {
		return 0, 0, 0, fmt.Errorf("同步异常: %w", err)
	}
	return
}

// InitSnapshot 扫描本地磁盘 初始化快照
func (s *Synchronizer) InitSnapshot(prefix string) error {
	ss := NewSnapshot()

	// 只扫描指定前缀的目录
	scanDir := s.baseDir
	if prefix != "" && prefix != "/" {
		scanDir = filepath.Join(s.baseDir, strings.TrimPrefix(prefix, "/"))
	}

	// 检查根目录
	stat, err := os.Stat(scanDir)
	if err != nil {
		if !os.IsNotExist(err) {
			return fmt.Errorf("根目录扫描异常: %w", err)
		}
		if err = os.MkdirAll(scanDir, os.ModePerm); err != nil {
			return fmt.Errorf("初始化根目录异常: %w", err)
		}
	} else if !stat.IsDir() {
		return fmt.Errorf("根目录被占用: [%s]", scanDir)
	}

	// 递归扫描目录树
	err = filepath.Walk(scanDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return fmt.Errorf("无法访问路径 %s: %w", path, err)
		}

		// 获取相对于目录树根路径的相对路径
		relPath, err := filepath.Rel(s.baseDir, path)
		if err != nil {
			return fmt.Errorf("无法获取相对路径 %s: %w", path, err)
		}
		if relPath == "." {
			return nil
		}
		relPath = urls.TransferSlash(relPath)

		// 跳过隐藏目录文件
		base := filepath.Base(path)
		if strings.HasPrefix(base, ".") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		sKey := "/" + relPath
		if sKey == prefix {
			return nil
		}
		ss.Put(sKey, info.IsDir())

		return nil
	})
	if err != nil {
		return fmt.Errorf("磁盘扫描异常: %w", err)
	}

	s.snapshot = ss
	return nil
}

// walkDir2SyncTasks 分页遍历 openlist 指定前缀目录下的文件, 加入到任务通道中
func (s *Synchronizer) walkDir2SyncTasks(prefix string) error {
	walker := openlist.WalkFsList(prefix, s.pageSize, s.apiRefreshFlag)
	var page openlist.FsList
	var err error

	eof := false
	err = trys.Try(func() (innerErr error) {
		page, innerErr = walker.Next()
		if innerErr == openlist.ErrWalkEOF {
			eof = true
			return nil
		}
		return
	}, 3, time.Second*5)

	for err == nil && !eof {
		taskList := make([]FileTask, len(page.Content))
		for i, info := range page.Content {
			taskList[i] = FsGetTask(prefix, info)
		}
		s.toSyncTasks <- taskList
		atomic.AddInt32(&s.activeTaskCount, 1)
		atomic.AddInt64(&s.hasScanTotal, int64(len(taskList)))

		err = trys.Try(func() (innerErr error) {
			page, innerErr = walker.Next()
			if innerErr == openlist.ErrWalkEOF {
				eof = true
				return nil
			}
			return
		}, 3, time.Second*5)
	}
	return err
}

// handleSyncTasks 广度遍历 toSyncs 任务通道进行同步
//
// 将同步完成的任务写入 okTaskChan 中
// 所有任务同步完成后, 自动关闭 okTaskChan
func (s *Synchronizer) handleSyncTasks(okTaskChan chan<- FileTask) {
	if okTaskChan == nil {
		return
	}

	if s.ctx == nil || s.eg == nil {
		return
	}

	// handleDir 处理目录, 请求下一层级数据, 并写入任务通道
	handleDir := func(task FileTask) error {
		localAbsPath := filepath.Join(s.baseDir, strings.TrimPrefix(task.LocalPath, "/"))
		if err := os.MkdirAll(localAbsPath, os.ModePerm); err != nil {
			return fmt.Errorf("初始化目录异常 [%s]: %w", localAbsPath, err)
		}

		if err := s.walkDir2SyncTasks(task.Path); err != nil {
			return fmt.Errorf("扫描 openlist 目录异常 [%s]: %w", task.Path, err)
		}
		return nil
	}

	// resolveFFmpegInput 获取 ffmpeg 抽帧的真实输入源。
	// strm 容器: 本地是 .strm 指针文件, 其文件内容即写入时已由播放器验证可用的真实下载地址,
	//	优先读取该 URL 作为抽帧输入; 读取失败再退回重建 openlist 直链。
	// 其余容器 (虚拟/音乐等): 退回重建 openlist 直链。
	resolveFFmpegInput := func(task *FileTask, localAbsPath string) (string, string) {
		if task == nil {
			return "", ""
		}
		if strings.EqualFold(filepath.Ext(localAbsPath), ".strm") {
			if data, err := os.ReadFile(localAbsPath); err == nil {
				if u := strings.TrimSpace(string(data)); u != "" {
					return u, "strm"
				}
			}
			// 读取失败退回重建直链
			return getRealDownloadUrl(sw.OpenlistPath(*task)), "rebuild"
		}
		return getRealDownloadUrl(sw.OpenlistPath(*task)), "rebuild"
	}

	// tryGenerateThumbnail 为指定文件尝试生成同名缩略图 (jpg)。
	// 无论文件是本次新写入还是此前已存在, 只要同名 jpg 不存在就会尝试,
	// 因此重跑同步 (新增:0) 也能补齐此前缺失的缩略图。
	// 三条来源: 列表 Thumb 内联下载(主, 非排除) / 365 插件钩子(辅, 非排除) / ffmpeg 抽帧(排除路径兜底)。
	tryGenerateThumbnail := func(task *FileTask, localAbsPath string) {
		if task == nil {
			return
		}
		if !config.C.Openlist.Enable365 && !config.C.Openlist.LocalTreeGen.FFmpegEnable {
			return
		}

		// 1. 同名 jpg 的绝对路径 (与媒体文件/365 插件同目录)
		baseName := filepath.Base(localAbsPath)
		if idx := strings.LastIndex(baseName, "."); idx != -1 {
			baseName = baseName[:idx]
		}
		jpgPath := filepath.Join(filepath.Dir(localAbsPath), baseName+".jpg")

		// 2. 本地图片已存在则跳过 (避免重复抽帧/下载)
		if _, errJpg := os.Stat(jpgPath); !os.IsNotExist(errJpg) {
			return
		}

		isExcluded := config.C.Openlist.IsExclude365Path(task.Path)
		// [thumb-debug] 临时诊断日志: 观察每个文件的判定与 ffmpeg 结果, 定位后删除
		logf(colors.Yellow, "[thumb-debug] path=%s excluded=%v ffmpeg=%v enable365=%v hasThumb=%v", task.Path, isExcluded, config.C.Openlist.LocalTreeGen.FFmpegEnable, config.C.Openlist.Enable365, task.Thumb != "")

		// 2.1 列表 Thumb 内联下载（主链路, 恢复原机制）:
		//     列表响应已携带 thumb 链接 (task.Thumb), 直接下载, 不依赖二次 fs/get;
		//     排除路径不走此路, 改由 ffmpeg 兜底。
		if !isExcluded && task.Thumb != "" {
			go openlist.Download365Thumb(task.Path, task.Thumb, filepath.Base(task.Path))
		}

		// 2.2 365 插件钩子（补充）: 非排除路径且启用 365 时,
		//     主动请求 FsGet 详情以触发 openlist.AfterFsGetHooks, 由其完成缩略图下载。
		if config.C.Openlist.Enable365 && !isExcluded {
			go func(taskPath, destJpgPath string) {
				if _, e := os.Stat(destJpgPath); e == nil {
					return
				}
				openlist.FetchFsGet(taskPath, nil)
			}(task.Path, jpgPath)
		}

		// 2.3 ffmpeg 抽帧: ffmpeg-enable 为总开关, 仅对 exclude-365-paths 中的目录抽帧生成封面;
		//     其余目录不在此处理, 交由 365 插件/列表 Thumb (2.1/2.2)。
		if config.C.Openlist.LocalTreeGen.FFmpegEnable && isExcluded {
			go func(t FileTask, destJpgPath, localPath string) {
				if _, e := os.Stat(destJpgPath); e == nil {
					logf(colors.Gray, "[thumb-debug] 已存在跳过: %s", destJpgPath)
					return
				}
				// 输入源: 优先读取本地 .strm 文件内容 (即写入时已由播放器验证可用的真实下载地址),
				// 避免用当前列表 sign 重建可能失效/不匹配的直链导致抽到 0 字节。
				dlUrl, src := resolveFFmpegInput(&t, localPath)
				if dlUrl == "" {
					logf(colors.Red, "[thumb-debug] 无法获取抽帧输入: %s", t.Path)
					return
				}
				logf(colors.Yellow, "[thumb-debug] ffmpeg 抽帧开始: path=%s src=%s url=%s", t.Path, src, dlUrl)
				pic, err := ffmpeg.ExtractVideoCover(dlUrl)
				if err != nil {
					logf(colors.Red, "[thumb-debug] ffmpeg 抽帧失败: path=%s url=%s err=%v", t.Path, dlUrl, err)
					return
				}
				if len(pic) == 0 {
					logf(colors.Red, "[thumb-debug] ffmpeg 抽帧输出为空(可能 seek 越界/输入非视频): path=%s url=%s", t.Path, dlUrl)
					return
				}
				// 写入前再校验, 防止与 2.1/2.2 竞态覆盖
				if _, e := os.Stat(destJpgPath); e != nil {
					if werr := os.WriteFile(destJpgPath, pic, os.ModePerm); werr != nil {
						logf(colors.Red, "[thumb-debug] 写文件失败: %v", werr)
					} else {
						logf(colors.Green, "[thumb-debug] ffmpeg 抽帧成功: %s", destJpgPath)
					}
				}
			}(*task, jpgPath, localAbsPath)
		}
	}

	// handleFile 处理文件, 根据容器类型以不同方式写入本地
	handleFile := func(task *FileTask) error {
		if task == nil {
			return nil
		}

		// 获取适配容器的 writer
		writer := LoadTaskWriter(task.Container)

		// 将 openlist 路径转换为本地磁盘相应路径
		task.LocalPath = writer.Path(task.Path)
		localAbsPath := filepath.Join(s.baseDir, strings.TrimPrefix(task.LocalPath, "/"))

		// 如果路径被目录占用, 则删除目录
		stat, err := os.Stat(localAbsPath)
		if err == nil {
			if !stat.IsDir() {
				// 文件已存在: 若本地修改时间晚于远端, 视为未变更, 跳过写入。
				// 但仍需确保缩略图存在 —— 即便本次未写入 (新增:0), 缺失的图也要补生成。
				if stat.ModTime().After(task.Modified) {
					tryGenerateThumbnail(task, localAbsPath)
					return nil
				}
			}
			if err := os.RemoveAll(localAbsPath); err != nil {
				return fmt.Errorf("删除占用路径异常 [%s]: %w", localAbsPath, err)
			}
		}

		if err := os.MkdirAll(filepath.Dir(localAbsPath), os.ModePerm); err != nil {
			return fmt.Errorf("初始化父目录异常 [%s]: %w", localAbsPath, err)
		}

		// 写入文件
		if err := writer.Write(*task, localAbsPath); err != nil {
			return err
		}

		// 新写入的文件, 生成缩略图
		tryGenerateThumbnail(task, localAbsPath)

		return nil
	}

	// handleTasks 处理任务, 将新增的文件写入本地, 任务处理完成后写入 okTaskChan
	handleTasks := func(tasks []FileTask) error {
		for _, task := range tasks {
			select {
			case <-s.ctx.Done():
				return s.ctx.Err()
			default:
				// 根据用户配置忽略特定文件和目录
				cfg := config.C.Openlist.LocalTreeGen
				if !cfg.IsValidPrefix(task.Path) {
					continue
				}
				if !task.IsDir && !cfg.IsAllowed(task.Container) {
					continue
				}

				// 处理任务
				if task.IsDir {
					if err := handleDir(task); err != nil {
						return err
					}
				} else {
					if err := handleFile(&task); err != nil {
						return err
					}
				}

				// 当前任务写入 okTaskChan
				okTaskChan <- task

				// 更新同步进度
				atomic.AddInt64(&s.hasScanFinish, 1)
			}
		}
		return nil
	}

	// BFS
	for tasks := range s.toSyncTasks {
		s.eg.Go(func() error {
			// 获取线程信号量
			select {
			case s.threadsSem <- struct{}{}:
			case <-s.ctx.Done():
				return s.ctx.Err()
			}

			// 释放线程
			defer func() { <-s.threadsSem }()

			// 更新活跃任务数
			defer func() {
				if atomic.AddInt32(&s.activeTaskCount, -1) == 0 {
					close(s.toSyncTasks)
				}
			}()

			return handleTasks(tasks)
		})
	}

	close(okTaskChan)
}

// updateLocalTree 监听 okTaskChan 生成新快照, 并移除本地磁盘中的过期文件, 同时统计变更数
func (s *Synchronizer) updateLocalTree(okTaskChan <-chan FileTask, total, added, deleted *int) {
	if okTaskChan == nil ||
		added == nil ||
		deleted == nil ||
		s.ctx == nil ||
		s.snapshot == nil {
		return
	}
	current := NewSnapshot()
	*added, *deleted, *total = 0, 0, 0

	// 循环处理任务
	chanOpen := true
	for chanOpen {
		select {
		case <-s.ctx.Done():
			return
		case task, ok := <-okTaskChan:
			if !ok {
				chanOpen = false
				break
			}
			cleanLocalPath := urls.TransferSlash(task.LocalPath)
			current.Put(cleanLocalPath, task.IsDir)
			*total++
			// 判断是否是新增
			if _, exists := s.snapshot.Check(cleanLocalPath); !exists {
				*added++
			}
		}
	}

	toDelete := make([]string, 0, 1<<6)

	// 统计并删除本地过期文件
	for path := range s.snapshot {
		if _, exists := current.Check(path); exists {
			continue
		}

		// 如果该文件是元数据/封面/字幕文件，且其关联的媒体文件或目录仍存在于当前有效任务快照中，则保留不删除
		isDir := s.snapshot[path].IsDir
		if !isDir && shouldKeepFile(current, path) {
			continue
		}

		path = strings.TrimPrefix(path, "/")
		toDelete = append(toDelete, filepath.Join(s.baseDir, path))
	}

	maxCount := config.C.Openlist.LocalTreeGen.AutoRemoveMaxCount
	if len(toDelete) > maxCount {
		logf(colors.Yellow, "过期文件数量 [%d] 超出最大限制 [%d], 跳过删除操作", len(toDelete), maxCount)
		return
	}

	for _, path := range toDelete {
		if err := files.ReleasePath(path); err != nil {
			logf(colors.Red, "删除过期文件失败: %v", err)
			continue
		}
		*deleted++
	}

	s.snapshot = nil
}

// shouldKeepFile 判断一个非 current 中的本地文件是否应该被保留而不删除。
// 针对封面图片、nfo元数据、字幕文件等，如果对应的媒体文件或其所在的目录依然存在于 current 中，则应保留。
func shouldKeepFile(current Snapshot, path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	isMetadata := false
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp", ".gif", ".nfo", ".xml", ".srt", ".ass", ".sub", ".vtt", ".ssa":
		isMetadata = true
	}
	if !isMetadata {
		return false
	}

	dir := urls.TransferSlash(filepath.Dir(path))
	// 如果父目录在 current 中不存在，说明该目录已经在远程不存在，不需要保留其下属文件
	if _, dirExists := current.Check(dir); !dirExists {
		return false
	}

	baseName := filepath.Base(path)
	baseName = baseName[:len(baseName)-len(ext)]

	// 1. 去除常见的效果图/封面后缀，判断是否是文件夹级别的封面
	artworkSuffixes := []string{"-fanart", "-poster", "-banner", "-thumb", "-landscape", "-logo", "-clearart", "-disc", "-backdrops", "-theme"}
	for _, suffix := range artworkSuffixes {
		baseName = strings.TrimSuffix(baseName, suffix)
	}

	folderArtworks := map[string]struct{}{
		"poster":    {},
		"fanart":    {},
		"banner":    {},
		"folder":    {},
		"logo":      {},
		"clearart":  {},
		"theme":     {},
		"backdrops": {},
		"disc":      {},
	}
	if _, isFolderArt := folderArtworks[strings.ToLower(baseName)]; isFolderArt {
		// 文件夹级别的海报图，只要文件夹存在就保留
		return true
	}

	// 2. 检查是否有对应的媒体文件存在于 current 中
	hasMedia := func(name string) bool {
		mediaExts := []string{".strm", ".mp4", ".mkv", ".avi", ".ts", ".mov", ".wmv", ".flv", ".mp3", ".flac", ".wav", ".ogg", ".m4a"}
		for _, me := range mediaExts {
			testPath := urls.TransferSlash(filepath.Join(dir, name+me))
			if _, exists := current.Check(testPath); exists {
				return true
			}
		}
		return false
	}

	tempName := baseName
	for {
		if hasMedia(tempName) {
			return true
		}
		lastDot := strings.LastIndex(tempName, ".")
		if lastDot == -1 {
			break
		}
		suffix := tempName[lastDot+1:]
		// 语言标识符或字幕指示（如 zh, zh-cn, default, forced 等）一般较短
		if len(suffix) > 10 {
			break
		}
		tempName = tempName[:lastDot]
	}

	return false
}

package openlist

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/config"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/model"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/https"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/jsons"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/strs"
)

// AfterFsGetHooks 暴露给插件注册钩子的回调列表
var AfterFsGetHooks []func(res *FsGet, path string)

// TriggerAfterFsGet 触发所有的 AfterFsGet 钩子
func TriggerAfterFsGet(res *FsGet, path string) {
	for _, hook := range AfterFsGetHooks {
		hook(res, path)
	}
}

// FetchResource 请求 openlist 资源 url 直链
func FetchResource(fi FetchInfo) model.HttpRes[Resource] {
	if strs.AnyEmpty(fi.Path) {
		return model.HttpRes[Resource]{Code: http.StatusBadRequest, Msg: "参数 path 不能为空"}
	}
	fi.Header = CleanHeader(fi.Header)

	if !fi.UseTranscode {
		// 请求原画资源
		res := FetchFsGet(fi.Path, fi.Header)
		if res.Code == http.StatusOK {
			return model.HttpRes[Resource]{Code: http.StatusOK, Data: Resource{Url: res.Data.RawUrl}}
		}
		return model.HttpRes[Resource]{Code: res.Code, Msg: res.Msg}
	}

	// 转码资源请求失败后, 递归请求原画资源
	failedAndTryRaw := func(originRes model.HttpRes[FsOther]) model.HttpRes[Resource] {
		if !fi.TryRawIfTranscodeFail {
			return model.HttpRes[Resource]{Code: originRes.Code, Msg: originRes.Msg}
		}
		logs.Error("请求转码资源失败, 尝试请求原画资源, 原始响应: %v", jsons.FromObject(originRes))
		fi.UseTranscode = false
		return FetchResource(fi)
	}

	// 请求转码资源
	res := FetchFsOther(fi.Path, fi.Header)
	if res.Code != http.StatusOK {
		return failedAndTryRaw(res)
	}

	// 匹配指定格式
	taskList := res.Data.VideoPreviewPlayInfo.LiveTranscodingTaskList
	if len(taskList) == 0 {
		return failedAndTryRaw(res)
	}
	allFmts := make([]string, 0, len(taskList))
	idx := -1
	for i, task := range taskList {
		allFmts = append(allFmts, task.TemplateId)
		if task.TemplateId == fi.Format {
			idx = i
			break
		}
	}
	if idx == -1 {
		logs.Error("查找不到指定的格式: %s, 所有可用的格式: [%s]", fi.Format, strings.Join(allFmts, ", "))
		return failedAndTryRaw(res)
	}

	link := taskList[idx].Url
	if link == "" {
		return failedAndTryRaw(res)
	}

	return model.HttpRes[Resource]{
		Code: http.StatusOK,
		Data: Resource{
			Url:       link,
			Subtitles: res.Data.VideoPreviewPlayInfo.LiveTranscodingSubtitleTaskList,
		},
	}
}

// FetchFsList 请求 openlist "/api/fs/list" 接口
//
// 传入 path 与接口的 path 作用一致
func FetchFsList(path string, header http.Header) model.HttpRes[FsList] {
	if strs.AnyEmpty(path) {
		return model.HttpRes[FsList]{Code: http.StatusBadRequest, Msg: "参数 path 不能为空"}
	}

	addMainApiRunner()
	defer removeMainApiRunner()

	var res FsList
	err := Fetch("/api/fs/list", http.MethodPost, header, map[string]any{
		"refresh":  false,
		"password": "",
		"path":     path,
	}, &res, false)
	if err != nil {
		return model.HttpRes[FsList]{Code: http.StatusInternalServerError, Msg: fmt.Sprintf("FsList 请求失败: %v", err)}
	}
	return model.HttpRes[FsList]{Code: http.StatusOK, Data: res}
}

// FetchFsGet 请求 openlist "/api/fs/get" 接口
//
// 传入 path 与接口的 path 作用一致
func FetchFsGet(path string, header http.Header) model.HttpRes[FsGet] {
	if strs.AnyEmpty(path) {
		return model.HttpRes[FsGet]{Code: http.StatusBadRequest, Msg: "参数 path 不能为空"}
	}

	addMainApiRunner()
	defer removeMainApiRunner()

	var res FsGet
	err := Fetch("/api/fs/get", http.MethodPost, header, map[string]any{
		"refresh":  false,
		"password": "",
		"path":     path,
	}, &res, false)
	if err != nil {
		return model.HttpRes[FsGet]{Code: http.StatusInternalServerError, Msg: fmt.Sprintf("FsGet 请求失败: %v", err)}
	}

	// 触发插件钩子
	TriggerAfterFsGet(&res, path)

	return model.HttpRes[FsGet]{Code: http.StatusOK, Data: res}
}

// Download365Thumb 下载 365 缩略图并保存到本地对应路径下
func Download365Thumb(path string, thumbUrl string, name string) {
	if thumbUrl == "" || name == "" {
		return
	}

	// 1. 获取本地文件目录，和 localtree 的目录规则保持一致
	localDir := filepath.Join(config.BasePath, "openlist-local-tree", filepath.FromSlash(filepath.Dir(path)))

	// 2. 确定文件名，后缀修改为 .jpg
	baseName := name
	if idx := strings.LastIndex(baseName, "."); idx != -1 {
		baseName = baseName[:idx]
	}
	jpgPath := filepath.Join(localDir, baseName+".jpg")

	DownloadThumb(thumbUrl, jpgPath)
}

// DownloadThumb 下载指定的缩略图到本地 jpgPath 绝对路径中，若配置了 token 则携带 Authorization 头部
func DownloadThumb(thumbUrl string, jpgPath string) {
	if thumbUrl == "" || jpgPath == "" {
		return
	}

	if err := os.MkdirAll(filepath.Dir(jpgPath), os.ModePerm); err != nil {
		logs.Error("创建 365 缩略图存储目录失败 [%s]: %v", filepath.Dir(jpgPath), err)
		return
	}

	logs.Info("开始下载 365 缩略图, 链接: %s, 保存路径: %s", thumbUrl, jpgPath)

	// 3. 发送请求下载图片，若配置了 token 则携带 Authorization 头部
	req := https.Get(thumbUrl)
	if config.C.Openlist.Token != "" {
		req.AddHeader("Authorization", config.C.Openlist.Token)
	}
	resp, err := req.Do()
	if err != nil {
		logs.Error("请求 365 缩略图失败: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logs.Error("请求 365 缩略图失败, 响应码: %d", resp.StatusCode)
		return
	}

	// 4. 保存为文件
	file, err := os.Create(jpgPath)
	if err != nil {
		logs.Error("创建 365 缩略图文件失败 [%s]: %v", jpgPath, err)
		return
	}
	defer file.Close()

	_, err = io.Copy(file, resp.Body)
	if err != nil {
		logs.Error("保存 365 缩略图失败: %v", err)
		return
	}

	logs.Success("成功下载并保存 365 缩略图: %s", jpgPath)
}

// FetchFsOther 请求 openlist "/api/fs/other" 接口
//
// 传入 path 与接口的 path 作用一致
func FetchFsOther(path string, header http.Header) model.HttpRes[FsOther] {
	if strs.AnyEmpty(path) {
		return model.HttpRes[FsOther]{Code: http.StatusBadRequest, Msg: "参数 path 不能为空"}
	}

	addMainApiRunner()
	defer removeMainApiRunner()

	var res FsOther
	err := Fetch("/api/fs/other", http.MethodPost, header, map[string]any{
		"method":   "video_preview",
		"password": "",
		"path":     path,
	}, &res, false)
	if err != nil {
		return model.HttpRes[FsOther]{Code: http.StatusInternalServerError, Msg: fmt.Sprintf("FsOther 请求失败: %v", err)}
	}
	return model.HttpRes[FsOther]{Code: http.StatusOK, Data: res}
}

// Fetch 请求 openlist api, 响应封装在 v 指针指向的结构中
func Fetch(uri, method string, header http.Header, body map[string]any, v any, closeConn bool) error {
	host := config.C.Openlist.Host
	token := config.C.Openlist.Token
	if strs.AnyEmpty(host, token) {
		return fmt.Errorf("openlist.host 或 openlist.token 配置为空")
	}

	// 1 发出请求
	if header == nil {
		header = make(http.Header)
	} else {
		header = header.Clone()
	}
	header.Set("Content-Type", "application/json;charset=utf-8")
	header.Set("Authorization", token)

	holder := https.Request(method, host+uri).Header(header).Body(https.MapBody(body))
	if closeConn {
		holder.CloseConn()
	}
	resp, err := holder.Do()
	if err != nil {
		return fmt.Errorf("Fetch 请求失败: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Fetch 请求失败, 错误响应码: %v", resp.Status)
	}

	// 2 检测响应状态是否正常
	resBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("Fetch 请求读取响应失败: %v", err)
	}

	var res RemoteCommonResult
	if err = json.Unmarshal(resBytes, &res); err != nil {
		return fmt.Errorf("Fetch 请求响应解析失败: %v, 响应内容: %v", err, string(resBytes))
	}
	if res.Code != http.StatusOK {
		return fmt.Errorf("Fetch 请求响应状态异常: %d, 消息: %s", res.Code, res.Message)
	}

	// 3 如果 v 参数为不为 nil 的指针, 写入响应数据
	vf := reflect.ValueOf(v)
	if vf.Kind() != reflect.Ptr || vf.IsNil() {
		return nil
	}
	if err = json.Unmarshal(res.Data, v); err != nil {
		return fmt.Errorf("Fetch 请求响应数据解析失败: %v, 响应内容: %s", err, string(res.Data))
	}
	return nil
}

// addMainApiRunner 添加主 api 请求标记
func addMainApiRunner() {
	walkWaiterMu.Lock()
	mainApiRunnerCount++
	walkWaiterMu.Unlock()
}

// removeMainApiRunner 移除主 api 请求标记
func removeMainApiRunner() {
	walkWaiterMu.Lock()
	if mainApiRunnerCount > 0 {
		mainApiRunnerCount--
	}
	if mainApiRunnerCount == 0 {
		walkWaiter.Broadcast()
	}
	walkWaiterMu.Unlock()
}

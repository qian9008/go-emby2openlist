import json

# Comprehensive translation mapping for all 61 tags
tag_translations = {
    "ActivityLog": "活动日志",
    "ApiKey": "API密钥",
    "Artists": "艺术家",
    "Audio": "音频",
    "Backup": "备份",
    "Branding": "品牌",
    "Channels": "频道",
    "ClientLog": "客户端日志",
    "Collection": "收藏",
    "Configuration": "配置",
    "Dashboard": "控制台",
    "Devices": "设备",
    "DisplayPreferences": "显示偏好",
    "DynamicHls": "动态HLS",
    "Environment": "环境",
    "Filter": "过滤器",
    "Genres": "流派",
    "HlsSegment": "HLS分段",
    "Image": "图像",
    "InstantMix": "即时混音",
    "ItemLookup": "项目查找",
    "ItemRefresh": "项目刷新",
    "ItemUpdate": "项目更新",
    "Items": "项目",
    "Library": "媒体库",
    "LibraryStructure": "媒体库结构",
    "LiveTv": "实时电视",
    "Localization": "本地化",
    "Lyrics": "歌词",
    "MediaInfo": "媒体信息",
    "MediaSegments": "媒体分段",
    "Movies": "电影",
    "MusicGenres": "音乐流派",
    "Package": "包",
    "Persons": "人物",
    "Playlists": "播放列表",
    "Playstate": "播放状态",
    "Plugins": "插件",
    "QuickConnect": "快速连接",
    "RemoteImage": "远程图像",
    "ScheduledTasks": "计划任务",
    "Search": "搜索",
    "Session": "会话",
    "Startup": "启动",
    "Studios": "工作室",
    "Subtitle": "字幕",
    "Suggestions": "建议",
    "SyncPlay": "同步播放",
    "System": "系统",
    "TimeSync": "时间同步",
    "Tmdb": "TMDB",
    "Trailers": "预告片",
    "Trickplay": "快进快退",
    "TvShows": "电视节目",
    "UniversalAudio": "通用音频",
    "User": "用户",
    "UserLibrary": "用户媒体库",
    "UserViews": "用户视图",
    "VideoAttachments": "视频附件",
    "Videos": "视频",
    "Years": "年份"
}

def translate_summary(text):
    if not text: return text
    
    t = text.strip()
    
    # Common patterns
    if t.startswith("Get "):
        t = "获取" + t[4:]
    elif t.startswith("Gets "):
        t = "获取" + t[5:]
    elif t.startswith("Create "):
        t = "创建" + t[7:]
    elif t.startswith("Creates "):
        t = "创建" + t[8:]
    elif t.startswith("Delete "):
        t = "删除" + t[7:]
    elif t.startswith("Deletes "):
        t = "删除" + t[8:]
    elif t.startswith("Update "):
        t = "更新" + t[7:]
    elif t.startswith("Updates "):
        t = "更新" + t[8:]
    elif t.startswith("Add "):
        t = "添加" + t[4:]
    elif t.startswith("Adds "):
        t = "添加" + t[5:]
    elif t.startswith("Remove "):
        t = "移除" + t[7:]
    elif t.startswith("Removes "):
        t = "移除" + t[8:]
    elif t.startswith("Search "):
        t = "搜索" + t[7:]
    elif t.startswith("Searches "):
        t = "搜索" + t[9:]
    elif t.startswith("Download "):
        t = "下载" + t[9:]
    elif t.startswith("Downloads "):
        t = "下载" + t[10:]
    elif t.startswith("Cancel "):
        t = "取消" + t[7:]
    elif t.startswith("Cancels "):
        t = "取消" + t[8:]

    # Specific common terms
    replacements = {
        "all ": "所有",
        "a ": "",
        "an ": "",
        "the ": "",
        "items": "项目",
        "item": "项目",
        "user": "用户",
        "users": "用户",
        "playlist": "播放列表",
        "playlists": "播放列表",
        "collection": "收藏",
        "collections": "收藏",
        "library": "媒体库",
        "libraries": "媒体库",
        "device": "设备",
        "devices": "设备",
        "image": "图像",
        "images": "图像",
        "metadata": "元数据",
        "configuration": "配置",
        "plugin": "插件",
        "plugins": "插件",
        "session": "会话",
        "sessions": "会话",
        "task": "任务",
        "tasks": "任务",
        "recording": "录制",
        "recordings": "录制",
        "channel": "频道",
        "channels": "频道",
        "subtitle": "字幕",
        "subtitles": "字幕",
        "lyric": "歌词",
        "lyrics": "歌词",
        "artist": "艺术家",
        "artists": "艺术家",
        "album": "专辑",
        "albums": "专辑",
        "genre": "流派",
        "genres": "流派",
        "movie": "电影",
        "movies": "电影",
        "series": "剧集",
        "episode": "剧集",
        "episodes": "剧集",
        "person": "人物",
        "persons": "人物",
        "studio": "工作室",
        "studios": "工作室",
        "year": "年份",
        "years": "年份",
        "info": "信息",
        "information": "信息",
        "status": "状态",
        "result": "结果",
        "results": "结果",
        "list": "列表",
        "lists": "列表",
        "by name": "按名称",
        "by id": "按ID",
        "from ": "从",
        "to ": "到",
        "with ": "使用",
        "for ": "为",
        "based on": "基于",
        "returned": "已返回",
        "retrieved": "已检索",
        "executed": "已执行",
        "started": "已开始",
        "stopped": "已停止",
        "completed": "已完成",
        "failed": "失败",
        "successful": "成功",
        "available": "可用",
        "current": "当前",
        "new": "新",
        "remote": "远程",
        "local": "本地",
        "external": "外部",
        "internal": "内部",
        "primary": "主要",
        "backdrop": "背景",
        "thumb": "缩略图",
        "logo": "徽标",
        "art": "艺术图",
        "disc": "光盘",
        "banner": "横幅",
        "screenshot": "截图",
        "theme": "主题",
        "video": "视频",
        "audio": "音频",
        "photo": "照片",
        "book": "书籍",
        "box set": "合集",
        "trailer": "预告片",
        "trailers": "预告片",
        "live tv": "实时电视",
        "timer": "定时器",
        "timers": "定时器",
        "series timer": "剧集定时器",
        "series timers": "剧集定时器",
        "tuner": "调谐器",
        "tuners": "调谐器",
        "lineup": "频道列表",
        "lineups": "频道列表",
        "listings": "节目表",
        "provider": "提供者",
        "providers": "提供者",
        "host": "主机",
        "hosts": "主机",
        "type": "类型",
        "types": "类型",
        "key": "密钥",
        "keys": "密钥",
        "api key": "API密钥",
        "api keys": "API密钥",
        "password": "密码",
        "reset": "重置",
        "auth": "身份验证",
        "authentication": "身份验证",
        "quick connect": "快速连接",
        "syncplay": "同步播放",
        "group": "组",
        "groups": "组",
        "backup": "备份",
        "backups": "备份",
        "restore": "恢复",
        "manifest": "清单",
        "archive": "归档",
        "splashscreen": "启动画面",
        "wizard": "向导",
        "startup": "启动",
        "branding": "品牌",
        "css": "CSS",
        "activity log": "活动日志",
        "entries": "条目",
        "entry": "条目",
        "message": "消息",
        "timing data": "计时数据",
        "encoded as": "编码为",
        "initialDelay": "初始延迟",
        "interval": "间隔",
        "ms": "毫秒",
        "directory browser": "目录浏览器",
        "default": "默认",
        "counts": "计数",
        "user data": "用户数据",
        "mapping options": "映射选项",
        "grouping options": "分组选项",
        "view": "视图",
        "views": "视图",
        "attachment": "附件",
        "attachments": "附件",
        "original file": "原始文件",
        "theme songs": "主题曲",
        "theme videos": "主题视频",
        "similar to": "类似于",
        "given": "给定的",
        "search criteria": "搜索条件",
        "parental rating": "家长分级",
        "score": "评分",
        "metadata editor": "元数据编辑器",
        "custom options": "自定义选项",
        "retry the operation": "重试操作",
        "full seconds": "整秒",
        "playable media types": "可播放媒体类型",
        "comma delimited": "逗号分隔",
        "pipe delimited": "管道符分隔",
        "remote control commands": "远程控制命令",
        "plain-text reason": "纯文本原因",
        "server is not available": "服务器不可用",
        "header parameter": "头部参数",
        "plugin configuration": "插件配置",
        "json body": "JSON体",
        "access forbidden": "禁止访问",
        "access schedule": "访问计划",
        "subtitle playback mode": "字幕播放模式",
        "algorithm to downmix": "混合算法",
        "surround sound": "环绕声",
        "stereo": "立体声",
        "unrated item": "未分级项目",
        "formats of spatial audio": "空间音频格式",
        "axis that should be scrolled": "应滚动的轴",
        "options to disable embedded subs": "禁用内嵌字幕选项",
        "sorting order": "排序顺序",
        "types of video ranges": "视频范围类型",
        "video ranges": "视频范围",
        "day of the week": "星期几",
        "weekdays": "工作日",
        "weekends": "周末",
        "all days": "所有日期",
        "filter to include or exclude": "包含或排除过滤器",
        "files": "文件",
        "folders": "文件夹",
        "true/false": "真/假",
        "api model": "API模型",
        "media segment": "媒体分段",
        "media segments": "媒体分段",
        "artist name": "艺术家名称",
        "attachment index": "附件索引",
        "attempts to retrieve": "尝试检索",
        "auth providers": "身份验证提供者",
        "authenticates": "验证",
        "authorizes": "授权",
        "pending": "待处理",
        "available countries": "可用国家",
        "available lineups": "可用频道列表",
        "available live tv channels": "可用实时电视频道",
        "available live tv services": "可用实时电视服务",
        "available packages": "可用包",
        "backup archive manifest": "备份归档清单",
        "backup created": "备份已创建",
        "backup restore started": "备份恢复已开始",
        "backups available": "可用备份",
        "bad request": "错误请求",
        "book remote search": "书籍远程搜索",
        "box set remote search": "合集远程搜索",
        "branding configuration": "品牌配置",
        "branding configuration updated": "品牌配置已更新",
        "branding css": "品牌CSS",
        "gets": "获取",
        "get": "获取",
        "creates": "创建",
        "create": "创建",
        "deletes": "删除",
        "delete": "删除",
        "updates": "更新",
        "update": "更新",
        "adds": "添加",
        "add": "添加",
        "removes": "移除",
        "remove": "移除",
        "searches": "搜索",
        "search": "搜索",
        "downloads": "下载",
        "download": "下载",
        "cancels": "取消",
        "cancel": "取消"
    }

    # Apply replacements (case insensitive but preserving structure)
    import re
    for eng, chi in sorted(replacements.items(), key=lambda x: len(x[0]), reverse=True):
        pattern = re.compile(re.escape(eng), re.IGNORECASE)
        t = pattern.sub(chi, t)
    
    # Clean up
    t = t.replace("  ", " ").strip()
    if not t.endswith("。") and len(t) > 2:
        t += "。"
        
    return t

def process_json(data):
    if isinstance(data, dict):
        new_data = {}
        for k, v in data.items():
            if k == "tags" and isinstance(v, list):
                new_data[k] = [tag_translations.get(tag, tag) for tag in v]
            elif k == "summary" and isinstance(v, str):
                new_data[k] = translate_summary(v)
            else:
                new_data[k] = process_json(v)
        return new_data
    elif isinstance(data, list):
        return [process_json(item) for item in data]
    else:
        return data

file_path = r'd:\Users\Documents\1\emby2openlist\jellyfin-openapi-stable.json'
output_path = r'd:\Users\Documents\1\emby2openlist\jellyfin-openapi-stable-zh.json'

with open(file_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

translated_data = process_json(data)

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(translated_data, f, ensure_ascii=False, indent=2)

print(f"Translation completed. Saved to {output_path}")

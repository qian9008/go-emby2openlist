package localtree

import (
	"testing"
)

// TestShouldKeepFile 测试 shouldKeepFile 函数的元数据、封面及字幕保护判定逻辑
func TestShouldKeepFile(t *testing.T) {
	current := NewSnapshot()

	// 1. 设置模拟的 current 有效任务快照
	current.Put("/Movie", true)                  // 文件夹存在
	current.Put("/Movie/film.strm", false)       // 电影 1 媒体文件存在
	current.Put("/Movie/nested/show.strm", false) // 嵌套目录中的媒体文件存在
	current.Put("/Movie/nested", true)           // 嵌套目录存在

	tests := []struct {
		name string
		path string
		want bool
	}{
		// --- 成功匹配（应该保留） ---
		{
			name: "同名封面图片保护",
			path: "/Movie/film.jpg",
			want: true,
		},
		{
			name: "艺术海报图保护",
			path: "/Movie/film-fanart.jpg",
			want: true,
		},
		{
			name: "多重后缀字幕文件保护",
			path: "/Movie/film.zh-cn.srt",
			want: true,
		},
		{
			name: "嵌套目录下的同名封面保护",
			path: "/Movie/nested/show.jpg",
			want: true,
		},
		{
			name: "文件夹级别海报保护",
			path: "/Movie/poster.jpg",
			want: true,
		},
		{
			name: "文件夹级别 folder.jpg 保护",
			path: "/Movie/folder.jpg",
			want: true,
		},
		{
			name: "文件夹级别 logo.png 保护",
			path: "/Movie/logo.png",
			want: true,
		},

		// --- 匹配失败（应该删除） ---
		{
			name: "非元数据格式文件直接删除",
			path: "/Movie/film.txt",
			want: false,
		},
		{
			name: "无关联媒体文件的图片删除",
			path: "/Movie/other-film.jpg",
			want: false,
		},
		{
			name: "父目录已不存在的图片删除",
			path: "/Movie2/poster.jpg",
			want: false,
		},
		{
			name: "无关联媒体的文件夹级别海报删除",
			path: "/Movie/nested-empty/poster.jpg",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := shouldKeepFile(current, tt.path)
			if got != tt.want {
				t.Errorf("shouldKeepFile() = %v, want %v for path %s", got, tt.want, tt.path)
			}
		})
	}
}

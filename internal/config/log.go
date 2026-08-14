package config

import "github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs/colors"

// Log 日志配置
type Log struct {
	DisableColor bool     `yaml:"disable-color"` // 是否禁用彩色日志输出
	Verbose      bool     `yaml:"verbose"`       // 是否输出所有详细请求日志（默认为 false）
	IgnorePaths  []string `yaml:"ignore-paths"`  // 自定义忽略日志输出的路径片段
}

// Init 配置初始化
func (lc *Log) Init() error {
	colors.SetEnabler(lc)
	return nil
}

// EnableColor 标记是否启用颜色输出
func (lc *Log) EnableColor() bool {
	return !lc.DisableColor
}

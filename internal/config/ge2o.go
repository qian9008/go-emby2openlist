package config

import "os"

type Ge2o struct {
	// ApiSecret 接口本地密钥
	ApiSecret string `yaml:"api-secret"`
	// Web web 平台配置
	Web *Web `yaml:"web"`

	// PelagicaBackendUrl Pelagica 后端转发地址
	PelagicaBackendUrl string `yaml:"pelagica-backend-url"`
	// StartPelagicaBackend 是否自动启动 Pelagica 后端
	StartPelagicaBackend *bool `yaml:"start-pelagica-backend"`
	// PelagicaBackendPath Pelagica 后端程序路径
	PelagicaBackendPath string `yaml:"pelagica-backend-path"`
	// PelagicaFrontendDir Pelagica 前端静态文件目录
	PelagicaFrontendDir string `yaml:"pelagica-frontend-dir"`
}

func (g *Ge2o) Init() error {
	if g.Web == nil {
		g.Web = new(Web)
	}

	if g.PelagicaBackendUrl == "" {
		g.PelagicaBackendUrl = "http://127.0.0.1:4321"
	}
	if g.PelagicaBackendPath == "" {
		g.PelagicaBackendPath = "./pelagica-backend"
	}
	if g.StartPelagicaBackend == nil {
		b := true
		g.StartPelagicaBackend = &b
	}
	if g.PelagicaFrontendDir == "" {
		if _, err := os.Stat("./dist"); err == nil {
			g.PelagicaFrontendDir = "./dist"
		} else if _, err := os.Stat("./pelagica/frontend/dist"); err == nil {
			g.PelagicaFrontendDir = "./pelagica/frontend/dist"
		}
	}
	return nil
}

type Web struct {

	// Disable 是否禁用 web 平台
	Disable bool `yaml:"disable"`

	// DisableEmbyBtn 是否禁用 emby 快速进入 web 平台的辅助按钮
	DisableEmbyBtn bool `yaml:"disable-emby-btn"`
}

// IsEnabled web 平台是否启用
func (w *Web) IsEnabled() bool {
	return !w.Disable
}

// IsEmbyBtnEnabled emby 辅助按钮是否启用
func (w *Web) IsEmbyBtnEnabled() bool {
	return !w.DisableEmbyBtn
}

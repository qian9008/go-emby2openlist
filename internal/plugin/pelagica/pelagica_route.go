package pelagica

import (
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/constant"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/service/emby"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/util/logs"
	"github.com/AmbitiousJun/go-emby2openlist/v2/internal/web"
)

func init() {
	// 注册 Pelagica 后端代理路由，指定优先级 50，作为较低优先级的 /api/ 通配符拦截
	web.RegisterExtraRule(constant.Reg_PelagicaAPI, emby.ProxyPelagica, 50)

	logs.Info("已加载 Pelagica 路由插件")
}

# Mini Mal1 静态展示站

这个目录是独立于完整 Next.js 电商系统的纯静态求职展示站。它只使用原生
HTML、CSS 和 JavaScript，不读取 SQLite，不调用业务 API，也不需要任何服务端
环境变量。

## 本地预览

在本目录或用任意静态服务器打开 `index.html`。仓库提供零依赖的 Node 静态
预览脚本，可在仓库根目录执行：

```powershell
node showcase/serve.mjs
```

然后访问 `http://127.0.0.1:4173`。

## 静态检查

```powershell
node --test showcase/check.mjs
```

检查器验证必需页面、内部锚点、本地资源、图片替代文本、敏感占位、虚构远程
地址和禁止出现的虚构架构组件。

## Vercel 设置

- Root Directory：`showcase`
- Framework Preset：`Other`
- Build Command：留空
- Output Directory：`.`（留空时使用项目根目录）
- Install Command：留空
- Environment Variables：不配置

该展示站不使用 Vercel Functions、数据库、`AUTH_SECRET` 或 `CRON_SECRET`。
完整电商系统仍保留在仓库根目录，按现有 Node.js + SQLite 文档运行。

## 内容边界

- 支付是模拟支付，不接入真实资金渠道。
- 截图于 2026-11-18 使用当前生产构建和隔离 SQLite 演示数据库重新采集。
- 截图包含商品分页、快捷加购、结算、个人资料和后台管理。
- 所有邮箱、地址、订单和账号均为明显的虚构测试数据。
- 未提供的视频使用明确占位，不生成虚构演示。
- GitHub 源码地址为 `https://github.com/zhenwuchen/Mini-Mal`。

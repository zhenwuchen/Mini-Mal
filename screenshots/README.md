# 截图清单

截图于 2026-11-18 使用当前 Next.js 生产构建、真实 Chrome 和隔离 SQLite
演示数据库重新采集。演示账号、邮箱、地址和订单均为明显的虚构测试数据，
不包含真实密码、Token、Session Cookie 或个人信息。

原始截图保存在忽略提交的 `output/playwright/`，公开副本位于
`showcase/assets/screenshots/`。

## 当前公开截图

| 文件 | 页面 | 尺寸 |
| --- | --- | --- |
| `home.png` | 未登录首页 | 1440 × 1000 |
| `products.png` | 当前商品列表、分页和快捷加购悬停态 | 1440 × 2400 |
| `products-mobile.png` | 390px 商品列表和快捷加购 | 390 × 1200 |
| `product-detail.png` | 商品详情与购买区域 | 1440 × 1200 |
| `cart.png` | 购物车和订单摘要 | 1440 × 1200 |
| `cart-mobile.png` | 390px 购物车 | 390 × 1200 |
| `checkout.png` | 地址选择与订单确认 | 1440 × 1200 |
| `order-detail.png` | 已支付订单、支付记录和金额明细 | 1440 × 1200 |
| `orders.png` | 用户订单列表 | 1440 × 1200 |
| `profile.png` | 个人资料编辑 | 1440 × 1200 |
| `login.png` | 登录页面 | 1440 × 1000 |
| `admin-dashboard.png` | 后台运营概览 | 1440 × 1100 |
| `admin-products.png` | 后台商品管理 | 1440 × 1100 |
| `admin-orders.png` | 后台订单管理 | 1440 × 1100 |
| `home-mobile.png` | 390px 首页 | 390 × 844 |

## 演示数据

- 普通用户：`demo-user@example.com`
- 管理员：`admin-demo@example.com`
- 商品：仓库 Seed 的 20 件演示商品
- 订单：一笔已支付订单和一笔待付款订单
- 收货地址：上海市示例路 100 号

密码仅用于本地截图会话，不写入仓库、截图或文档。

## 后续可选素材

视频仍不是本阶段的强制交付项。后续可录制支付失败、取消订单、库存恢复和
超时任务聚合结果，但不使用伪造页面或生成视频替代真实运行结果。

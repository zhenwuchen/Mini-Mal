# 技术架构

## 1. 架构边界

Mini Mal1 由两个独立部分组成：

1. **完整业务系统**：Next.js 16 App Router + React + Prisma + SQLite。
2. **静态展示站**：`showcase/` 下的原生 HTML、CSS 和 JavaScript。

静态展示站不依赖 Prisma、SQLite、业务 API 或服务端环境变量，可单独部署。
完整业务系统仍使用 Node.js 单实例与持久化 SQLite 文件。

## 2. 请求与调用关系

```text
浏览器
  -> Next.js App Router 页面
  -> Server Actions / Route Handler
  -> Service 层
  -> Prisma Client
  -> SQLite

外部 Cron
  -> POST /api/internal/orders/expire
  -> Bearer Token 鉴权
  -> 内部订单过期 Handler
  -> 订单过期 Service
  -> 订单取消 Service
  -> Prisma Client
  -> SQLite
```

页面负责渲染和用户交互，Server Actions 与 Route Handler 负责请求边界的输入
解析和错误映射。支付、订单、购物车、地址、取消和超时扫描逻辑集中在
`src/lib/` 的 Service 模块中。

## 3. 应用目录

| 路径 | 职责 |
| --- | --- |
| `src/app/` | 页面、布局、Server Actions、Route Handler |
| `src/components/` | 页面与交互组件 |
| `src/lib/` | Service、校验、状态机和数据访问逻辑 |
| `prisma/schema.prisma` | SQLite 数据模型 |
| `prisma/migrations/` | 已提交的数据库迁移 |
| `tests/` | Node.js Test Runner 测试 |
| `showcase/` | 独立静态展示站 |
| `deploy/` | 生产环境与 systemd 模板 |
| `docs/` | 技术、部署与求职展示文档 |

## 4. 数据模型

Prisma Schema 当前包含以下主要模型：

- `User`：账户、密码哈希与角色；
- `Category`、`Product`：分类与商品；
- `Cart`、`CartItem`：用户购物车与商品数量；
- `Address`：用户收货地址；
- `Order`、`OrderItem`：订单、金额、结构化地址快照与商品快照；
- `Payment`：模拟支付记录、状态、幂等键与失败信息；
- `AppMeta`：订单过期扫描游标等内部元数据。

订单关联关系使用限制删除或级联规则保护历史数据。订单快照避免商品或地址后续
变化影响历史订单展示。

## 5. 认证与用户隔离

- 注册流程校验姓名、邮箱、密码与确认密码。
- 密码使用 bcrypt 哈希后写入数据库。
- 登录由 Auth.js / NextAuth Credentials Provider 完成。
- Service 层通过当前会话获取用户 ID。
- 订单、支付、购物车和地址查询都带当前用户约束。
- 不存在的资源与其他用户的资源使用一致的未找到结果，避免泄露资源归属。

## 6. 一致性边界

关键写操作放在 Prisma Transaction 中：

- 创建订单：读取当前购物车与地址、校验商品、扣减库存、写订单与订单项、
  清理购物车；
- 完成支付：校验订单和支付状态、条件更新订单与支付、取消其他待处理模拟支付；
- 取消订单：更新订单状态、取消待处理支付、逐项恢复库存；
- 地址默认切换：清除旧默认并设置新默认。

订单创建、支付和取消服务对 SQLite 锁冲突做有限次数重试，最终失败会映射为
面向用户的繁忙错误，不泄露 SQL 或内部异常。

## 7. 部署边界

### 完整业务系统

- Linux Node.js 22.x；
- 单个 Next.js 应用进程；
- 持久化 SQLite 数据库文件；
- 外部 HTTPS Cron 每分钟调用内部订单过期接口；
- 不使用 standalone、cluster、PM2 多实例或后台 Worker。

### 静态展示站

- 原生静态文件；
- Vercel Root Directory 为 `showcase`；
- 无 Build Command、无 Functions、无数据库与环境变量；
- 不承载完整业务 API。

详细生产流程见 `docs/production-deployment.md`。

## 8. 代码证据

- `src/lib/payment-service.ts`
- `src/lib/order-service.ts`
- `src/lib/order-cancel-service.ts`
- `src/lib/order-expiration-service.ts`
- `src/lib/internal-task-auth.ts`
- `src/app/api/internal/orders/expire/route.ts`
- `prisma/schema.prisma`

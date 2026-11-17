# SQLite 单实例生产方案摘要

本文件只提供求职展示所需的高层摘要。完整的 Linux 部署、Migration、systemd、
备份、恢复和故障处理步骤以仓库现有
[`docs/production-deployment.md`](../production-deployment.md) 为准，不在此重复。

## 1. 为什么当前不适合 Serverless

- SQLite 是文件数据库，需要持久化且可写的数据目录；
- Prisma SQLite 原生查询引擎与当前构建产物需要固定运行环境；
- 订单取消、支付和库存更新依赖事务与写锁语义；
- 外部 Cron 需要访问同一个持久化数据库；
- 多实例 Serverless 无法保证单文件 SQLite 写入模型。

因此完整 Next.js 业务应用不部署到 Vercel；Vercel 只部署 `showcase/` 静态文件。

## 2. 当前生产形态

```text
Linux
  systemd
    one Next.js process
      Prisma Client
        /var/lib/mini-mall/app.db

external HTTPS Cron
  -> /api/internal/orders/expire
  -> Bearer Token
  -> same application process
  -> same SQLite database
```

要求：

- Node.js 22.19.x；
- 单实例、单写入进程；
- `DATABASE_URL` 使用绝对 SQLite 路径；
- 数据库目录可写，以创建 journal/WAL 文件；
- 数据库文件位于发布目录之外；
- 外部 Cron 与内部任务使用独立的 `CRON_SECRET`；
- 生产环境变量放在受保护文件中，不进入 Git 或日志。

## 3. 发布与 Migration

- Build 命令为 `npm run db:generate && next build`；
- Build 不运行 Migration 或 Seed；
- 发布使用 `npm run db:migrate:deploy`；
- 不使用 `db:push` 绕过 Migration；
- 不在生产运行 `prisma migrate dev`；
- 订单与支付重建 Migration 属于高风险迁移，必须预先备份并停止写入。

## 4. 备份与恢复

仓库中的 `scripts/sqlite-backup.mjs` 调用 SQLite Backup API：

```text
node scripts/sqlite-backup.mjs
  --database <absolute-db-path>
  --output-dir <absolute-backup-dir>
```

脚本验证输入路径、拒绝数据库目录内的输出、生成唯一备份文件、检查文件非空并
写入 SHA-256 校验和。恢复是运维流程，不是自动回滚：

1. 暂停 Cron；
2. 停止应用写入；
3. 保留失败数据库及 sidecar 文件；
4. 验证备份 SHA-256；
5. 停止应用后恢复数据库；
6. 执行 SQLite 完整性与外键检查；
7. 验证业务数据后启动单实例；
8. 完成 smoke test 后再恢复 Cron。

## 5. 当前限制

- 不支持多个应用实例同时写入；
- 不支持 Vercel Serverless 直接访问业务数据库；
- 备份需要部署 `sqlite3` CLI；
- 需要独立外部调度器；
- 高写入量或多区域可用性场景需要重新评估数据库与部署架构。

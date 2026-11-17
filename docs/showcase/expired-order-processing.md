# 超时订单处理机制

## 1. 触发方式

完整业务系统使用外部 Cron 每分钟调用：

```text
POST /api/internal/orders/expire
Authorization: Bearer <CRON_SECRET>
```

请求体可以为空或 `{}`，也可传入受限制的 `batchSize` 与 `timeBudgetMs`。
生产调度器禁止重叠执行。

## 2. 请求鉴权

`src/lib/internal-task-auth.ts` 执行以下检查：

- 必须有 `CRON_SECRET`；
- Secret 必须是 Base64URL；
- 解码后至少 32 字节；
- Authorization 必须使用 Bearer scheme；
- Token 不得超长或包含非法字符；
- 使用 SHA-256 摘要和 `timingSafeEqual` 比较；
- 缺失或无效配置与错误 Token 返回不同受控结果；
- 不回退到 `AUTH_SECRET`，不把 Secret 写入响应或日志。

Handler 先完成方法和鉴权检查，再读取请求体。

## 3. 请求限制

- 请求体最大 1024 字节；
- 批大小默认 50，范围 1–100；
- 时间预算默认 10 秒，范围 1–60 秒；
- 只接受 `batchSize` 和 `timeBudgetMs` 两个字段；
- 拒绝数组、非对象 JSON、非法 UTF-8、未知字段和越界数字。

响应设置 `Cache-Control: no-store`，不开放 CORS。

## 4. 扫描逻辑

1. 从 `AppMeta` 读取 `order-expiration.scan-cursor.v1`。
2. 使用数据库时间读取已到期、仍为 `PENDING_PAYMENT` 的订单。
3. 按到期时间和订单 ID 稳定排序。
4. 有游标时，将游标之后的记录优先排列。
5. 每次只取当前批次大小。
6. 逐单调用订单取消 Service，复用正常的支付取消和库存恢复逻辑。
7. 达到时间预算后停止启动新订单，并报告延迟数量。
8. 成功读取到最后一条候选记录后推进游标。

持久化游标负责公平轮转。持续失败的订单不会永久阻塞排序更早的其他订单。

## 5. 结果语义

成功响应包含：

```text
executionId
scanned
cancelled
skipped
failed
inconsistent
deferred
budgetExhausted
durationMs
```

- `skipped`：订单已变化、已取消或已不再可取消；
- `inconsistent`：扫描到待付款订单但存在成功支付，需要运营关注；
- `failed`：取消过程发生非跳过错误；
- `deferred`：因时间预算未处理的本批候选；
- `budgetExhausted`：本轮达到时间预算。

接口只返回聚合结果和错误类别，不返回用户、订单号或支付信息。

## 6. HTTP 结果

| 状态 | 含义 |
| --- | --- |
| 200 | 扫描完成，可包含部分失败或一致性异常聚合 |
| 400 | 请求方法正确但请求体不合法 |
| 401 | Bearer Token 缺失或不匹配 |
| 405 | 使用非 POST 方法 |
| 500 | 未预期内部错误 |
| 503 | 鉴权配置错误或扫描基础设施失败 |

外部调度器应根据状态码决定是否重试；400、401、405 不应自动重试。

## 7. 测试证据

`tests/internal-task-auth.test.ts`、`tests/internal-order-expiration-handler.test.ts`
和 `tests/order-expiration.test.ts` 覆盖：

- Bearer Token 格式、长度和常量时间比较；
- 鉴权先于读取请求体；
- 请求体大小、JSON、UTF-8、字段和边界；
- 扫描批次、时间预算和稳定排序；
- 公平轮转越过持续失败订单；
- 收款与取消并发收敛；
- 重复超时任务只恢复一次库存；
- 响应与日志不泄露敏感标识。

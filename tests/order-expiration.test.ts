import assert from "node:assert/strict";
import test from "node:test";

import {
  Prisma,
  type PrismaClient,
  type Product,
  type User,
} from "@prisma/client";

import { createOrderCancelService } from "../src/lib/order-cancel-service";
import {
  OrderExpirationError,
  createOrderExpirationService,
} from "../src/lib/order-expiration-service";
import { createIsolatedOrderExpirationTestDatabase } from "./helpers/test-database";

const testDatabase = createIsolatedOrderExpirationTestDatabase();
const prisma = testDatabase.prisma;
const testPrefix = `phase06-6-3-order-expiration-${process.pid}-${Date.now()}`;
let fixtureSequence = 0;

type ScanCandidate = {
  id: string;
  orderNumber: string;
  userId: string;
};

type ModelOperation = {
  model: string;
  action: string;
  args: unknown[];
};

type OperationInterceptor = (
  operation: ModelOperation,
) => unknown | Promise<unknown>;

function nextFixtureName(label: string) {
  fixtureSequence += 1;
  return `${testPrefix}-${fixtureSequence}-${label}`;
}

async function readDatabaseNowMs(): Promise<number> {
  const [row] = await prisma.$queryRaw<Array<{ nowMs: bigint }>>`
    SELECT CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER) AS nowMs
  `;

  return Number(row.nowMs);
}

async function createUser(label: string): Promise<User> {
  const fixture = nextFixtureName(label);

  return prisma.user.create({
    data: {
      name: `Order Expiration Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-order-expiration-tests",
    },
  });
}

async function createProduct({
  label,
  price = 1_000,
  stock,
}: {
  label: string;
  price?: number;
  stock: number;
}): Promise<Product> {
  const fixture = nextFixtureName(label);
  const category = await prisma.category.create({
    data: {
      name: `Order Expiration Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });

  return prisma.product.create({
    data: {
      name: `Order Expiration Product ${label}`,
      slug: `${fixture}-product`,
      price,
      stock,
      categoryId: category.id,
    },
  });
}

async function createOrder({
  id,
  userId,
  expiresAt,
  status = "PENDING_PAYMENT",
  paidAt = null,
  cancelledAt = null,
  items = [],
}: {
  id?: string;
  userId: string;
  expiresAt: Date | null;
  status?: string;
  paidAt?: Date | null;
  cancelledAt?: Date | null;
  items?: Array<{
    productId: string | null;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
}) {
  const fixture = nextFixtureName("order");
  const itemsAmount = items.reduce(
    (total, item) => total + item.unitPrice * item.quantity,
    0,
  );
  const order = await prisma.order.create({
    data: {
      id,
      orderNumber: `${fixture}-number`,
      userId,
      checkoutKey: `${fixture}-checkout`,
      itemsAmount,
      shippingAmount: 0,
      discountAmount: 0,
      totalAmount: itemsAmount,
      currency: "CNY",
      status,
      expiresAt,
      paidAt,
      cancelledAt,
      shippingName: "订单超时测试收件人",
      shippingPhone: "13800138000",
      shippingAddress: "浙江省杭州市西湖区测试路 1 号",
    },
  });

  if (items.length > 0) {
    await prisma.orderItem.createMany({
      data: items.map((item) => ({
        orderId: order.id,
        productId: item.productId,
        productName: item.productName,
        productSlug: item.productName.toLowerCase().replaceAll(" ", "-"),
        productImageUrl: null,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      })),
    });
  }

  return order;
}

async function createPayment(
  orderId: string,
  status: string,
  paidAt: Date | null = null,
) {
  return prisma.payment.create({
    data: {
      orderId,
      amount: 1_000,
      currency: "CNY",
      status,
      provider: "MOCK",
      method: "MOCK",
      idempotencyKey: nextFixtureName("payment"),
      paidAt,
    },
  });
}

function expirationServiceFor(
  client: PrismaClient = prisma,
  getCurrentTimeMs: () => number = () => Date.now(),
) {
  return createOrderExpirationService({
    prisma: client,
    now: () => new Date(),
    getCurrentTimeMs,
  });
}

function userCancelServiceFor(userId: string) {
  return createOrderCancelService({
    prisma,
    getCurrentUserId: async () => userId,
    now: () => new Date(),
  });
}

async function assertExpirationError(
  operation: Promise<unknown>,
  code: string,
) {
  await assert.rejects(operation, (error) => {
    assert.ok(error instanceof OrderExpirationError);
    assert.equal(error.code, code);
    assert.doesNotMatch(
      error.message,
      /SQL|Prisma|SELECT|INSERT|UPDATE|session|secret/i,
    );
    return true;
  });
}

function createScanHookPrisma(
  afterScan: (candidates: ScanCandidate[]) => Promise<void>,
): PrismaClient {
  let hooked = false;

  return new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === "$queryRaw") {
        const queryRaw = Reflect.get(target, property, receiver);

        if (typeof queryRaw !== "function") {
          return queryRaw;
        }

        return async (...args: unknown[]) => {
          const result = await Reflect.apply(
            queryRaw,
            target,
            args,
          );

          if (!hooked) {
            hooked = true;
            await afterScan(result as ScanCandidate[]);
          }

          return result;
        };
      }

      const value = Reflect.get(target, property, receiver);

      return typeof value === "function"
        ? value.bind(target)
        : value;
    },
  }) as PrismaClient;
}

function createInterceptedPrisma(
  interceptor: OperationInterceptor,
): PrismaClient {
  function wrapTransaction(
    transaction: Prisma.TransactionClient,
  ) {
    return new Proxy(transaction, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);

        if (
          typeof property !== "string" ||
          value === null ||
          typeof value !== "object"
        ) {
          return typeof value === "function"
            ? value.bind(target)
            : value;
        }

        return new Proxy(value, {
          get(delegate, action, delegateReceiver) {
            const method = Reflect.get(
              delegate,
              action,
              delegateReceiver,
            );

            if (typeof method !== "function") {
              return method;
            }

            return async (...args: unknown[]) => {
              const replacement = await interceptor({
                model: property,
                action: String(action),
                args,
              });

              if (replacement !== undefined) {
                return replacement;
              }

              return Reflect.apply(method, delegate, args);
            };
          },
        });
      },
    });
  }

  return new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return (
          operation: (
            transaction: Prisma.TransactionClient,
          ) => Promise<unknown>,
          options?: {
            maxWait?: number;
            timeout?: number;
            isolationLevel?: Prisma.TransactionIsolationLevel;
          },
        ) =>
          target.$transaction(
            (transaction) =>
              operation(wrapTransaction(transaction)),
            options,
          );
      }

      const value = Reflect.get(target, property, receiver);

      return typeof value === "function"
        ? value.bind(target)
        : value;
    },
  }) as PrismaClient;
}

test.before(async () => {
  await testDatabase.initialize();
});

test.afterEach(async () => {
  await prisma.order.updateMany({
    where: {
      status: "PENDING_PAYMENT",
      expiresAt: { lte: new Date() },
    },
    data: { status: "CANCELLED" },
  });
});

test.after(async () => {
  await testDatabase.cleanup();
});

test("cancels an expired pending order and restores its resources", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("expired");
  const product = await createProduct({
    label: "expired",
    stock: 2,
  });
  const order = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const payment = await createPayment(order.id, "PENDING");

  const result = await expirationServiceFor().expirePendingOrders({
    batchSize: 50,
    timeBudgetMs: 5_000,
  });
  const [savedOrder, savedProduct, savedPayment] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      }),
    ]);

  assert.equal(result.scanned, 1);
  assert.equal(result.cancelled, 1);
  assert.equal(result.skipped, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.deferred, 0);
  assert.equal(savedOrder.status, "CANCELLED");
  assert.ok(savedOrder.cancelledAt);
  assert.equal(savedProduct.stock, 4);
  assert.equal(savedPayment.status, "CANCELLED");
});

test("does not cancel an unexpired order", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("unexpired");
  const order = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs + 60_000),
  });

  const result = await expirationServiceFor().expirePendingOrders();

  assert.equal(result.scanned, 0);
  assert.equal(result.cancelled, 0);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
});

test("does not cancel historical orders without expiration", async () => {
  const user = await createUser("null-expiration");
  const order = await createOrder({
    userId: user.id,
    expiresAt: null,
  });

  const result = await expirationServiceFor().expirePendingOrders();

  assert.equal(result.scanned, 0);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
});

test("does not cancel an already paid order", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("paid");
  const product = await createProduct({
    label: "paid",
    stock: 3,
  });
  const order = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    status: "PAID",
    paidAt: new Date(nowMs),
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });

  const result = await expirationServiceFor().expirePendingOrders();
  const [savedOrder, savedProduct] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    }),
  ]);

  assert.equal(result.scanned, 0);
  assert.equal(savedOrder.status, "PAID");
  assert.equal(savedProduct.stock, 3);
});

test("does not restore stock again for an already cancelled order", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("already-cancelled");
  const product = await createProduct({
    label: "already-cancelled",
    stock: 5,
  });
  await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    status: "CANCELLED",
    cancelledAt: new Date(nowMs),
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });

  const result = await expirationServiceFor().expirePendingOrders();
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });

  assert.equal(result.scanned, 0);
  assert.equal(savedProduct.stock, 5);
});

test("restores every product in a multi-item expired order", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("multi-item");
  const first = await createProduct({
    label: "multi-item-first",
    stock: 4,
  });
  const second = await createProduct({
    label: "multi-item-second",
    stock: 8,
  });
  await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    items: [
      {
        productId: first.id,
        productName: first.name,
        quantity: 2,
        unitPrice: first.price,
      },
      {
        productId: second.id,
        productName: second.name,
        quantity: 3,
        unitPrice: second.price,
      },
    ],
  });

  const result = await expirationServiceFor().expirePendingOrders();
  const [savedFirst, savedSecond] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: first.id } }),
    prisma.product.findUniqueOrThrow({ where: { id: second.id } }),
  ]);

  assert.equal(result.cancelled, 1);
  assert.equal(savedFirst.stock, 6);
  assert.equal(savedSecond.stock, 11);
});

test("continues processing when another order fails", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("partial-failure");
  const failingProduct = await createProduct({
    label: "partial-failure",
    stock: 1,
  });
  const successfulProduct = await createProduct({
    label: "partial-success",
    stock: 2,
  });
  const failingOrder = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 120_000),
    items: [
      {
        productId: failingProduct.id,
        productName: failingProduct.name,
        quantity: 2,
        unitPrice: failingProduct.price,
      },
    ],
  });
  const successfulOrder = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    items: [
      {
        productId: successfulProduct.id,
        productName: successfulProduct.name,
        quantity: 1,
        unitPrice: successfulProduct.price,
      },
    ],
  });
  const failingClient = createInterceptedPrisma(
    ({ model, action, args }) => {
      if (
        model === "product" &&
        action === "updateMany" &&
        (args[0] as { where?: { id?: string } })?.where?.id ===
          failingProduct.id
      ) {
        throw new Error("injected stock restoration failure");
      }

      return undefined;
    },
  );

  const result = await expirationServiceFor(
    failingClient,
  ).expirePendingOrders({ batchSize: 10 });
  const [failedOrder, successfulOrderAfter, failedStock, restoredStock] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: failingOrder.id } }),
      prisma.order.findUniqueOrThrow({
        where: { id: successfulOrder.id },
      }),
      prisma.product.findUniqueOrThrow({
        where: { id: failingProduct.id },
      }),
      prisma.product.findUniqueOrThrow({
        where: { id: successfulProduct.id },
      }),
    ]);

  assert.equal(result.scanned, 2);
  assert.equal(result.cancelled, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.failures, [
    {
      orderId: failingOrder.id,
      errorCode: "STOCK_RESTORE_FAILED",
    },
  ]);
  assert.equal(failedOrder.status, "PENDING_PAYMENT");
  assert.equal(failedStock.stock, 1);
  assert.equal(successfulOrderAfter.status, "CANCELLED");
  assert.equal(restoredStock.stock, 3);
});

test("skips safely when an order is paid after scanning", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("paid-after-scan");
  const product = await createProduct({
    label: "paid-after-scan",
    stock: 3,
  });
  const order = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const payment = await createPayment(order.id, "PENDING");
  const client = createScanHookPrisma(async (candidates) => {
    const [candidate] = candidates;
    assert.ok(candidate);
    const paidAt = new Date();

    await prisma.$transaction(async (transaction) => {
      const updatedOrder = await transaction.order.updateMany({
        where: {
          id: candidate.id,
          status: "PENDING_PAYMENT",
        },
        data: { status: "PAID", paidAt },
      });
      const updatedPayment = await transaction.payment.updateMany({
        where: {
          id: payment.id,
          status: "PENDING",
        },
        data: { status: "SUCCEEDED", paidAt },
      });

      assert.equal(updatedOrder.count, 1);
      assert.equal(updatedPayment.count, 1);
    });
  });

  const result = await expirationServiceFor(
    client,
  ).expirePendingOrders();
  const [savedOrder, savedPayment, savedProduct] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      }),
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      }),
    ]);

  assert.equal(result.scanned, 1);
  assert.equal(result.cancelled, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 0);
  assert.equal(savedOrder.status, "PAID");
  assert.equal(savedPayment.status, "SUCCEEDED");
  assert.equal(savedProduct.stock, 3);
});

test("skips when the user cancels after scanning", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("cancelled-after-scan");
  const product = await createProduct({
    label: "cancelled-after-scan",
    stock: 1,
  });
  await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const client = createScanHookPrisma(async (candidates) => {
    const [candidate] = candidates;
    assert.ok(candidate);

    await userCancelServiceFor(user.id).cancelOrder({
      orderNumber: candidate.orderNumber,
    });
  });

  const result = await expirationServiceFor(
    client,
  ).expirePendingOrders();
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });

  assert.equal(result.scanned, 1);
  assert.equal(result.cancelled, 0);
  assert.equal(result.skipped, 1);
  assert.equal(savedProduct.stock, 3);
});

test("two automatic tasks restore stock only once", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("concurrent-automatic");
  const product = await createProduct({
    label: "concurrent-automatic",
    stock: 1,
  });
  await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  let arrived = 0;
  let releaseBarrier: () => void = () => undefined;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const createBarrierClient = () =>
    createScanHookPrisma(async () => {
      arrived += 1;

      if (arrived === 2) {
        releaseBarrier();
      }

      await barrier;
    });

  const results = await Promise.all([
    expirationServiceFor(createBarrierClient()).expirePendingOrders({
      batchSize: 1,
    }),
    expirationServiceFor(createBarrierClient()).expirePendingOrders({
      batchSize: 1,
    }),
  ]);
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });

  assert.deepEqual(
    results.map((result) => result.scanned),
    [1, 1],
  );
  assert.equal(
    results.reduce(
      (total, result) => total + result.cancelled,
      0,
    ),
    1,
  );
  assert.equal(
    results.reduce(
      (total, result) => total + result.skipped,
      0,
    ),
    1,
  );
  assert.equal(savedProduct.stock, 3);
});

test("limits scanning to the requested batch size in stable order", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("batch-limit");
  const newest = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 10_000),
  });
  const oldest = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 30_000),
  });
  const middle = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 20_000),
  });

  const result = await expirationServiceFor().expirePendingOrders({
    batchSize: 2,
  });
  const [oldestAfter, middleAfter, newestAfter] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: oldest.id } }),
      prisma.order.findUniqueOrThrow({ where: { id: middle.id } }),
      prisma.order.findUniqueOrThrow({ where: { id: newest.id } }),
    ]);

  assert.equal(result.scanned, 2);
  assert.equal(result.cancelled, 2);
  assert.equal(oldestAfter.status, "CANCELLED");
  assert.equal(middleAfter.status, "CANCELLED");
  assert.equal(newestAfter.status, "PENDING_PAYMENT");
});

test("stops starting new orders when the time budget is exhausted", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("time-budget");
  await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 20_000),
  });
  await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 10_000),
  });
  const ticks = [0, 0, 101];

  const result = await expirationServiceFor(
    prisma,
    () => ticks.shift() ?? 101,
  ).expirePendingOrders({
    batchSize: 2,
    timeBudgetMs: 100,
  });

  assert.equal(result.scanned, 2);
  assert.equal(result.cancelled, 1);
  assert.equal(result.deferred, 1);
  assert.equal(result.budgetExhausted, true);
});

test("uses a monotonic default clock instead of Date.now", async () => {
  const service = createOrderExpirationService({
    prisma,
    now: () => new Date(),
  });
  const originalDateNow = Date.now;
  let scan: Promise<unknown>;

  try {
    Date.now = () => {
      throw new Error("wall clock must not drive the scan budget");
    };
    scan = service.expirePendingOrders();
  } finally {
    Date.now = originalDateNow;
  }

  await assert.doesNotReject(scan);
});

test("keeps the soft budget when an injected clock moves backwards", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("clock-rollback");
  await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
  });
  const ticks = [1_000, 999, 998];

  const result = await expirationServiceFor(
    prisma,
    () => ticks.shift() ?? 998,
  ).expirePendingOrders({
    batchSize: 1,
    timeBudgetMs: 100,
  });

  assert.equal(result.cancelled, 1);
  assert.equal(result.deferred, 0);
  assert.equal(result.budgetExhausted, false);
  assert.equal(result.durationMs, 0);
});

test("rejects null and non-object options with a stable error", async () => {
  const service = expirationServiceFor();
  const invalidOptions = [null, "invalid", 42, [], () => undefined];

  for (const options of invalidOptions) {
    await assertExpirationError(
      service.expirePendingOrders(
        options as unknown as Parameters<
          typeof service.expirePendingOrders
        >[0],
      ),
      "INVALID_OPTIONS",
    );
  }
});

test("accepts safe integer batch and budget boundaries", async () => {
  const service = expirationServiceFor();

  for (const batchSize of [1, 100]) {
    const result = await service.expirePendingOrders({
      batchSize,
      timeBudgetMs: 1,
    });
    assert.equal(result.scanned, 0);
  }

  for (const timeBudgetMs of [1, 60_000]) {
    const result = await service.expirePendingOrders({
      batchSize: 1,
      timeBudgetMs,
    });
    assert.equal(result.scanned, 0);
  }
});

test("rejects unsafe or out-of-range batch sizes", async () => {
  const service = expirationServiceFor();
  const invalidBatchSizes = [
    0,
    101,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "10",
    null,
  ];

  for (const batchSize of invalidBatchSizes) {
    await assertExpirationError(
      service.expirePendingOrders({
        batchSize,
      } as unknown as Parameters<
        typeof service.expirePendingOrders
      >[0]),
      "INVALID_BATCH_SIZE",
    );
  }
});

test("rejects unsafe or out-of-range time budgets", async () => {
  const service = expirationServiceFor();
  const invalidTimeBudgets = [
    0,
    60_001,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    "1000",
    null,
  ];

  for (const timeBudgetMs of invalidTimeBudgets) {
    await assertExpirationError(
      service.expirePendingOrders({
        timeBudgetMs,
      } as unknown as Parameters<
        typeof service.expirePendingOrders
      >[0]),
      "INVALID_TIME_BUDGET",
    );
  }
});

test("preserves the internal cause of a scan query failure", async () => {
  const cause = new Error(
    "SQL SELECT failed for session secret@example.com",
  );
  const failingClient = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === "$queryRaw") {
        return async () => {
          throw cause;
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function"
        ? value.bind(target)
        : value;
    },
  }) as PrismaClient;

  await assert.rejects(
    expirationServiceFor(failingClient).expirePendingOrders(),
    (error) => {
      assert.ok(error instanceof OrderExpirationError);
      assert.equal(error.code, "ORDER_EXPIRATION_SCAN_FAILED");
      assert.equal(error.cause, cause);
      assert.doesNotMatch(
        error.message,
        /SQL|SELECT|session|secret|Prisma/i,
      );
      return true;
    },
  );
});

test("orders identical expiration times by id ASC", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("same-expiration");
  const firstProduct = await createProduct({
    label: "same-expiration-first",
    stock: 1,
  });
  const secondProduct = await createProduct({
    label: "same-expiration-second",
    stock: 1,
  });
  const expiresAt = new Date(nowMs - 86_400_000);
  const higherIdOrder = await createOrder({
    id: `${testPrefix}-same-expiration-b`,
    userId: user.id,
    expiresAt,
    items: [
      {
        productId: secondProduct.id,
        productName: secondProduct.name,
        quantity: 0,
        unitPrice: secondProduct.price,
      },
    ],
  });
  const lowerIdOrder = await createOrder({
    id: `${testPrefix}-same-expiration-a`,
    userId: user.id,
    expiresAt,
    items: [
      {
        productId: firstProduct.id,
        productName: firstProduct.name,
        quantity: 0,
        unitPrice: firstProduct.price,
      },
    ],
  });

  const result = await expirationServiceFor().expirePendingOrders({
    batchSize: 2,
  });

  assert.deepEqual(
    result.failures.map((failure) => failure.orderId),
    [lowerIdOrder.id, higherIdOrder.id],
  );
});

test("reports successful payment consistency errors separately", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("successful-payment-consistency");
  const product = await createProduct({
    label: "successful-payment-consistency",
    stock: 3,
  });
  const order = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 60_000),
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const successfulPayment = await createPayment(
    order.id,
    "SUCCEEDED",
    new Date(nowMs),
  );
  const pendingPayment = await createPayment(order.id, "PENDING");

  const result = await expirationServiceFor().expirePendingOrders();
  const [savedOrder, savedProduct, savedSuccessful, savedPending] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { id: successfulPayment.id },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { id: pendingPayment.id },
      }),
    ]);

  assert.equal(result.scanned, 1);
  assert.equal(result.cancelled, 0);
  assert.equal(result.skipped, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.inconsistent, 1);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.inconsistencies, [
    {
      orderId: order.id,
      errorCode: "SUCCESSFUL_PAYMENT_EXISTS",
    },
  ]);
  assert.equal(savedOrder.status, "PENDING_PAYMENT");
  assert.equal(savedOrder.cancelledAt, null);
  assert.equal(savedProduct.stock, 3);
  assert.equal(savedSuccessful.status, "SUCCEEDED");
  assert.equal(savedPending.status, "PENDING");
});

test("rotates past persistent failures across repeated scans", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("persistent-failure-rotation");
  const firstFailingProduct = await createProduct({
    label: "persistent-failure-first",
    stock: 1,
  });
  const secondFailingProduct = await createProduct({
    label: "persistent-failure-second",
    stock: 1,
  });
  const healthyProduct = await createProduct({
    label: "persistent-failure-healthy",
    stock: 2,
  });
  const firstFailingOrder = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 259_200_000),
    items: [
      {
        productId: firstFailingProduct.id,
        productName: firstFailingProduct.name,
        quantity: 2,
        unitPrice: firstFailingProduct.price,
      },
    ],
  });
  const secondFailingOrder = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 172_800_000),
    items: [
      {
        productId: secondFailingProduct.id,
        productName: secondFailingProduct.name,
        quantity: 2,
        unitPrice: secondFailingProduct.price,
      },
    ],
  });
  const healthyOrder = await createOrder({
    userId: user.id,
    expiresAt: new Date(nowMs - 86_400_000),
    items: [
      {
        productId: healthyProduct.id,
        productName: healthyProduct.name,
        quantity: 1,
        unitPrice: healthyProduct.price,
      },
    ],
  });
  const failPersistentOrders: OperationInterceptor = ({
    model,
    action,
    args,
  }) => {
    if (model !== "product" || action !== "updateMany") {
      return undefined;
    }

    const productId = (
      args[0] as { where?: { id?: string } }
    )?.where?.id;

    if (
      productId === firstFailingProduct.id ||
      productId === secondFailingProduct.id
    ) {
      throw new Error("injected persistent stock failure");
    }

    return undefined;
  };

  const first = await expirationServiceFor(
    createInterceptedPrisma(failPersistentOrders),
  ).expirePendingOrders({
    batchSize: 1,
  });
  const second = await expirationServiceFor(
    createInterceptedPrisma(failPersistentOrders),
  ).expirePendingOrders({
    batchSize: 1,
  });
  const third = await expirationServiceFor(
    createInterceptedPrisma(failPersistentOrders),
  ).expirePendingOrders({
    batchSize: 1,
  });
  const [
    firstFailingAfter,
    secondFailingAfter,
    healthyAfter,
    firstStock,
    secondStock,
    healthyStock,
  ] = await Promise.all([
    prisma.order.findUniqueOrThrow({
      where: { id: firstFailingOrder.id },
    }),
    prisma.order.findUniqueOrThrow({
      where: { id: secondFailingOrder.id },
    }),
    prisma.order.findUniqueOrThrow({
      where: { id: healthyOrder.id },
    }),
    prisma.product.findUniqueOrThrow({
      where: { id: firstFailingProduct.id },
    }),
    prisma.product.findUniqueOrThrow({
      where: { id: secondFailingProduct.id },
    }),
    prisma.product.findUniqueOrThrow({
      where: { id: healthyProduct.id },
    }),
  ]);

  assert.equal(first.failed, 1);
  assert.equal(second.failed, 1);
  assert.equal(third.cancelled, 1);
  assert.equal(firstFailingAfter.status, "PENDING_PAYMENT");
  assert.equal(secondFailingAfter.status, "PENDING_PAYMENT");
  assert.equal(healthyAfter.status, "CANCELLED");
  assert.equal(firstStock.stock, 1);
  assert.equal(secondStock.stock, 1);
  assert.equal(healthyStock.stock, 3);
});

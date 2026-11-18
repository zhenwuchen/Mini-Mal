import assert from "node:assert/strict";
import test from "node:test";

import {
  Prisma,
  PrismaClient,
  type User,
} from "@prisma/client";

import {
  PaymentError,
  createPaymentService,
  type PaymentErrorCode,
} from "../src/lib/payment-service";
import {
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
  isPaymentStatus,
} from "../src/lib/payment-status";
import { createSqliteWriteLock } from "./helpers/sqlite-write-lock";
import { createIsolatedPaymentTestDatabase } from "./helpers/test-database";

const testDatabase = createIsolatedPaymentTestDatabase();
const prisma = testDatabase.prisma;
const testPrefix = `phase06-6-2-payment-${process.pid}-${Date.now()}`;
const fixedNow = new Date("2026-09-01T08:30:00.000Z");
let fixtureSequence = 0;

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

async function createUser(label: string): Promise<User> {
  const fixture = nextFixtureName(label);

  return prisma.user.create({
    data: {
      name: `Payment Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-payment-tests",
    },
  });
}

async function createOrder(
  userId: string,
  overrides: {
    orderNumber?: string;
    totalAmount?: number;
    currency?: string;
    status?: string;
    expiresAt?: Date | null;
    paidAt?: Date | null;
  } = {},
) {
  const fixture = nextFixtureName("order");

  return prisma.order.create({
    data: {
      orderNumber: overrides.orderNumber ?? `${fixture}-number`,
      userId,
      checkoutKey: `${fixture}-checkout`,
      itemsAmount: overrides.totalAmount ?? 2_500,
      shippingAmount: 0,
      discountAmount: 0,
      totalAmount: overrides.totalAmount ?? 2_500,
      currency: overrides.currency ?? "CNY",
      status: overrides.status ?? "PENDING_PAYMENT",
      expiresAt: overrides.expiresAt ?? null,
      paidAt: overrides.paidAt ?? null,
      shippingName: "模拟支付测试收件人",
      shippingPhone: "13800138000",
      shippingAddress: "浙江省杭州市西湖区测试路 1 号",
    },
  });
}

async function createMockPayment(
  orderId: string,
  overrides: {
    amount?: number;
    currency?: string;
    status?: string;
    provider?: string | null;
    method?: string;
    idempotencyKey?: string | null;
    failureCode?: string | null;
    failureReason?: string | null;
    paidAt?: Date | null;
  } = {},
) {
  return prisma.payment.create({
    data: {
      orderId,
      amount: overrides.amount ?? 2_500,
      currency: overrides.currency ?? "CNY",
      status: overrides.status ?? "PENDING",
      provider:
        overrides.provider === undefined
          ? "MOCK"
          : overrides.provider,
      method: overrides.method ?? "MOCK",
      idempotencyKey:
        overrides.idempotencyKey === undefined
          ? nextFixtureName("payment-key")
          : overrides.idempotencyKey,
      failureCode: overrides.failureCode ?? null,
      failureReason: overrides.failureReason ?? null,
      paidAt: overrides.paidAt ?? null,
    },
  });
}

function serviceFor(
  userId: string | null,
  client: PrismaClient = prisma,
  currentTime: () => Date = () => fixedNow,
) {
  return createPaymentService({
    prisma: client,
    getCurrentUserId: async () => userId,
    now: currentTime,
  });
}

async function readDatabaseNowMs(): Promise<bigint> {
  const [row] = await prisma.$queryRaw<Array<{ nowMs: bigint }>>`
    SELECT CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER) AS nowMs
  `;

  return row.nowMs;
}

function assertPaymentError(
  error: unknown,
  code: PaymentErrorCode,
) {
  assert.ok(error instanceof PaymentError);
  assert.equal(error.code, code);
  assert.doesNotMatch(
    error.message,
    /SQL|Prisma|stack|injected|SELECT|INSERT/i,
  );
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
          if (
            property === "$queryRaw" &&
            typeof value === "function"
          ) {
            return async (...args: unknown[]) => {
              const replacement = await interceptor({
                model: "$queryRaw",
                action: "query",
                args,
              });

              if (replacement !== undefined) {
                return replacement;
              }

              return Reflect.apply(value, target, args);
            };
          }

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

test.after(async () => {
  await testDatabase.cleanup();
});

test("defines every supported payment status", () => {
  assert.deepEqual(PAYMENT_STATUS, {
    PENDING: "PENDING",
    SUCCEEDED: "SUCCEEDED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
    REFUNDED: "REFUNDED",
  });
});

test("accepts only known payment statuses", () => {
  const knownStatuses = [
    "PENDING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "REFUNDED",
  ];

  for (const status of knownStatuses) {
    assert.equal(isPaymentStatus(status), true);
  }

  for (const status of [
    "pending",
    "UNKNOWN",
    "",
    null,
    undefined,
    1,
  ]) {
    assert.equal(isPaymentStatus(status), false);
  }
});

test("allows only the four payment state transitions in this phase", () => {
  const allowedTransitions = [
    ["PENDING", "SUCCEEDED"],
    ["PENDING", "FAILED"],
    ["PENDING", "CANCELLED"],
    ["SUCCEEDED", "REFUNDED"],
  ];
  const forbiddenTransitions = [
    ["PENDING", "REFUNDED"],
    ["SUCCEEDED", "FAILED"],
    ["FAILED", "PENDING"],
    ["CANCELLED", "PENDING"],
    ["REFUNDED", "SUCCEEDED"],
    ["UNKNOWN", "FAILED"],
    ["PENDING", "UNKNOWN"],
  ];

  for (const [from, to] of allowedTransitions) {
    assert.equal(canTransitionPaymentStatus(from, to), true);
  }

  for (const [from, to] of forbiddenTransitions) {
    assert.equal(canTransitionPaymentStatus(from, to), false);
  }
});

test("uses an isolated SQLite database that is not the development database", () => {
  assert.match(testDatabase.databaseUrl, /^file:/);
  assert.doesNotMatch(testDatabase.databaseUrl, /dev\.db/i);
});

test("stores Prisma DateTime values as integer Unix milliseconds", async () => {
  const nowMs = await readDatabaseNowMs();
  const user = await createUser("datetime-storage");
  const expiresAt = new Date(Number(nowMs) + 60_000);
  const order = await createOrder(user.id, { expiresAt });
  const [stored] = await prisma.$queryRaw<
    Array<{ storedExpiresAt: string; storageType: string }>
  >`
    SELECT
      quote("expiresAt") AS storedExpiresAt,
      typeof("expiresAt") AS storageType
    FROM "Order"
    WHERE "id" = ${order.id}
  `;

  assert.equal(stored.storageType, "integer");
  assert.equal(
    stored.storedExpiresAt,
    expiresAt.getTime().toString(),
  );
});

test("starts a mock payment using server-side amount and currency", async () => {
  const user = await createUser("start-success");
  const order = await createOrder(user.id, {
    totalAmount: 4_321,
    currency: "USD",
  });
  const idempotencyKey = nextFixtureName("start-success-key");

  const result = await serviceFor(user.id).startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey,
  });
  const saved = await prisma.payment.findUnique({
    where: { id: result.payment.id },
  });

  assert.ok(saved);
  assert.equal(saved.orderId, order.id);
  assert.equal(saved.amount, 4_321);
  assert.equal(saved.currency, "USD");
  assert.equal(saved.status, "PENDING");
  assert.equal(saved.provider, "MOCK");
  assert.equal(saved.method, "MOCK");
  assert.equal(saved.idempotencyKey, idempotencyKey);
  assert.equal("userId" in result.payment, false);
  assert.equal(result.order.orderNumber, order.orderNumber);
  assert.equal(result.order.status, "PENDING_PAYMENT");
});

test("starts a mock payment before the order expires", async () => {
  const user = await createUser("start-before-expiration");
  const order = await createOrder(user.id, {
    expiresAt: new Date(fixedNow.getTime() + 60_000),
  });

  const result = await serviceFor(user.id).startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("start-before-expiration-key"),
  });
  const saved = await prisma.payment.findUniqueOrThrow({
    where: { id: result.payment.id },
  });

  assert.equal(saved.status, "PENDING");
  assert.equal(saved.paidAt, null);
});

test("keeps historical orders without an expiration payable", async () => {
  const user = await createUser("start-null-expiration");
  const order = await createOrder(user.id, {
    expiresAt: null,
  });
  const service = serviceFor(user.id);

  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("start-null-expiration-key"),
  });
  const completed = await service.completeMockPayment({
    orderNumber: order.orderNumber,
    paymentId: started.payment.id,
  });

  assert.equal(completed.order.status, "PAID");
  assert.equal(completed.payment.status, "SUCCEEDED");
});

test("rejects starting a payment after the order expires", async () => {
  const user = await createUser("start-after-expiration");
  const order = await createOrder(user.id, {
    expiresAt: new Date(fixedNow.getTime() - 1),
  });

  await assert.rejects(
    serviceFor(user.id).startMockPayment({
      orderNumber: order.orderNumber,
      idempotencyKey: nextFixtureName("start-after-expiration-key"),
      expiresAt: new Date("2035-01-01T00:00:00.000Z"),
    } as Parameters<
      ReturnType<typeof serviceFor>["startMockPayment"]
    >[0]),
    (error) => {
      assertPaymentError(error, "ORDER_EXPIRED");
      return true;
    },
  );
  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    0,
  );
});

test("rejects starting a payment exactly at the order expiration", async () => {
  const user = await createUser("start-exact-expiration");
  const order = await createOrder(user.id, {
    expiresAt: fixedNow,
  });

  await assert.rejects(
    serviceFor(user.id).startMockPayment({
      orderNumber: order.orderNumber,
      idempotencyKey: nextFixtureName("start-exact-expiration-key"),
    }),
    (error) => {
      assertPaymentError(error, "ORDER_EXPIRED");
      return true;
    },
  );
  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    0,
  );
});

test("ignores client-supplied identity, amount, currency, status, and provider fields", async () => {
  const user = await createUser("start-ignore-fields");
  const otherUser = await createUser("start-ignore-fields-other");
  const order = await createOrder(user.id, {
    totalAmount: 1_100,
    currency: "CNY",
  });

  const result = await serviceFor(user.id).startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("start-ignore-fields-key"),
    userId: otherUser.id,
    amount: 1,
    currency: "JPY",
    status: "SUCCEEDED",
    provider: "STRIPE",
    method: "CARD",
    paidAt: fixedNow,
  } as Parameters<
    ReturnType<typeof serviceFor>["startMockPayment"]
  >[0]);
  const saved = await prisma.payment.findUnique({
    where: { id: result.payment.id },
  });

  assert.ok(saved);
  assert.equal(saved.amount, 1_100);
  assert.equal(saved.currency, "CNY");
  assert.equal(saved.status, "PENDING");
  assert.equal(saved.provider, "MOCK");
  assert.equal(saved.method, "MOCK");
  assert.equal(saved.paidAt, null);
});

test("rejects a start request when no user is signed in", async () => {
  const user = await createUser("start-signed-out");
  const order = await createOrder(user.id);

  await assert.rejects(
    serviceFor(null).startMockPayment({
      orderNumber: order.orderNumber,
      idempotencyKey: nextFixtureName("signed-out-key"),
    }),
    (error) => {
      assertPaymentError(error, "UNAUTHENTICATED");
      return true;
    },
  );
  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    0,
  );
});

test("treats missing and unowned orders as the same not-found error", async () => {
  const user = await createUser("start-owner");
  const otherUser = await createUser("start-owner-other");
  const otherOrder = await createOrder(otherUser.id);
  const service = serviceFor(user.id);

  await assert.rejects(
    service.startMockPayment({
      orderNumber: otherOrder.orderNumber,
      idempotencyKey: nextFixtureName("foreign-order-key"),
    }),
    (error) => {
      assertPaymentError(error, "ORDER_NOT_FOUND");
      return true;
    },
  );
  await assert.rejects(
    service.startMockPayment({
      orderNumber: nextFixtureName("missing-order"),
      idempotencyKey: nextFixtureName("missing-order-key"),
    }),
    (error) => {
      assertPaymentError(error, "ORDER_NOT_FOUND");
      return true;
    },
  );
  assert.equal(
    await prisma.payment.count({ where: { orderId: otherOrder.id } }),
    0,
  );
});

test("rejects payments for orders that are not awaiting payment", async () => {
  const user = await createUser("start-order-status");
  const service = serviceFor(user.id);
  const statuses = [
    "PAID",
    "CANCELLED",
    "COMPLETED",
    "PROCESSING",
    "SHIPPED",
    "REFUNDED",
  ];

  for (const status of statuses) {
    const order = await createOrder(user.id, { status });

    await assert.rejects(
      service.startMockPayment({
        orderNumber: order.orderNumber,
        idempotencyKey: nextFixtureName(`status-${status}`),
      }),
      (error) => {
        assertPaymentError(error, "ORDER_NOT_PAYABLE");
        return true;
      },
    );
  }
});

test("rejects missing, malformed, and oversized idempotency keys", async () => {
  const user = await createUser("start-idempotency-validation");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const invalidKeys: unknown[] = [
    "",
    "   ",
    "key with spaces",
    "key/with/slashes",
    "a".repeat(129),
    null,
  ];

  for (const idempotencyKey of invalidKeys) {
    await assert.rejects(
      service.startMockPayment({
        orderNumber: order.orderNumber,
        idempotencyKey,
      } as { orderNumber: string; idempotencyKey: string }),
      (error) => {
        assertPaymentError(error, "INVALID_IDEMPOTENCY_KEY");
        return true;
      },
    );
  }

  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    0,
  );
});

test("returns the original payment for the same idempotency key", async () => {
  const user = await createUser("start-idempotent");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const input = {
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("start-idempotent-key"),
  };

  const first = await service.startMockPayment(input);
  const second = await service.startMockPayment(input);

  assert.equal(second.payment.id, first.payment.id);
  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    1,
  );
});

test("keeps idempotent start behavior after the order expires", async () => {
  const user = await createUser("start-idempotent-expired");
  const order = await createOrder(user.id, {
    expiresAt: new Date(fixedNow.getTime() - 1),
  });
  const idempotencyKey = nextFixtureName(
    "start-idempotent-expired-key",
  );
  const existing = await createMockPayment(order.id, {
    idempotencyKey,
  });

  const result = await serviceFor(user.id).startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey,
  });

  assert.equal(result.payment.id, existing.id);
  assert.equal(result.payment.status, "PENDING");
});

test("creates separate attempts for different idempotency keys", async () => {
  const user = await createUser("start-different-keys");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);

  const first = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("attempt-one"),
  });
  const second = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("attempt-two"),
  });

  assert.notEqual(second.payment.id, first.payment.id);
  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    2,
  );
});

test("concurrent starts with one idempotency key create one payment", async () => {
  const user = await createUser("start-concurrent-idempotent");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const input = {
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("concurrent-key"),
  };

  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      service.startMockPayment(input),
    ),
  );

  assert.equal(
    new Set(results.map((result) => result.payment.id)).size,
    1,
  );
  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    1,
  );
});

test("does not treat another provider's payment as a mock idempotent record", async () => {
  const user = await createUser("start-other-provider");
  const order = await createOrder(user.id);
  const idempotencyKey = nextFixtureName("shared-provider-key");
  const otherProviderPayment = await createMockPayment(order.id, {
    provider: "STRIPE",
    method: "CARD",
    idempotencyKey,
  });

  const result = await serviceFor(user.id).startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey,
  });

  assert.notEqual(result.payment.id, otherProviderPayment.id);
  assert.equal(result.payment.provider, "MOCK");
  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    2,
  );
});

test("rolls back a new payment when completion changes the order before start finishes", async () => {
  const user = await createUser("start-complete-race");
  const order = await createOrder(user.id);
  let orderReadCount = 0;
  const racingClient = createInterceptedPrisma(
    ({ model, action }) => {
      if (model === "order" && action === "findFirst") {
        orderReadCount += 1;

        if (orderReadCount >= 2) {
          return {
            ...order,
            status: "PAID",
            paidAt: fixedNow,
          };
        }
      }

      return undefined;
    },
  );

  await assert.rejects(
    serviceFor(user.id, racingClient).startMockPayment({
      orderNumber: order.orderNumber,
      idempotencyKey: nextFixtureName("start-complete-race-key"),
    }),
    (error) => {
      assertPaymentError(error, "ORDER_NOT_PAYABLE");
      return true;
    },
  );
  assert.equal(
    await prisma.payment.count({ where: { orderId: order.id } }),
    0,
  );
});

test("maps session read failures to a safe error for every payment operation", async () => {
  const user = await createUser("session-error");
  const order = await createOrder(user.id);
  const payment = await createMockPayment(order.id);
  const service = createPaymentService({
    prisma,
    getCurrentUserId: async () => {
      throw new Error("SQL SELECT secret FROM Session");
    },
  });
  const operations = [
    () =>
      service.startMockPayment({
        orderNumber: order.orderNumber,
        idempotencyKey: nextFixtureName("session-error-start"),
      }),
    () =>
      service.completeMockPayment({
        orderNumber: order.orderNumber,
        paymentId: payment.id,
      }),
    () =>
      service.failMockPayment({
        orderNumber: order.orderNumber,
        paymentId: payment.id,
        failureCode: "MOCK_PAYMENT_FAILED",
      }),
  ];

  for (const operation of operations) {
    await assert.rejects(operation, (error) => {
      assertPaymentError(error, "PAYMENT_OPERATION_FAILED");
      return true;
    });
  }
});

test("does not expose an unexpected error from the start-payment lookup", async () => {
  const user = await createUser("start-lookup-error");
  const order = await createOrder(user.id);
  const failingClient = createInterceptedPrisma(
    ({ model, action }) => {
      if (model === "order" && action === "findFirst") {
        throw new Error("SQL SELECT secret FROM Order");
      }

      return undefined;
    },
  );

  await assert.rejects(
    serviceFor(user.id, failingClient).startMockPayment({
      orderNumber: order.orderNumber,
      idempotencyKey: nextFixtureName("start-lookup-error-key"),
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_OPERATION_FAILED");
      return true;
    },
  );
});

test("completes a mock payment and atomically pays the order", async () => {
  const user = await createUser("complete-success");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("complete-success-key"),
  });

  const paidNotBefore = await readDatabaseNowMs();
  const result = await service.completeMockPayment({
    orderNumber: order.orderNumber,
    paymentId: started.payment.id,
    userId: "forged-user",
    amount: 1,
    status: "REFUNDED",
    paidAt: new Date("2000-01-01T00:00:00.000Z"),
  } as Parameters<
    ReturnType<typeof serviceFor>["completeMockPayment"]
  >[0]);
  const paidNotAfter = await readDatabaseNowMs();
  const savedOrder = await prisma.order.findUnique({
    where: { id: order.id },
  });
  const savedPayment = await prisma.payment.findUnique({
    where: { id: started.payment.id },
  });

  assert.equal(result.order.status, "PAID");
  assert.equal(result.payment.status, "SUCCEEDED");
  assert.equal(savedOrder?.status, "PAID");
  assert.ok(savedOrder?.paidAt);
  assert.ok(
    savedOrder.paidAt.getTime() >= Number(paidNotBefore),
  );
  assert.ok(
    savedOrder.paidAt.getTime() <= Number(paidNotAfter),
  );
  assert.equal(savedPayment?.status, "SUCCEEDED");
  assert.equal(
    savedPayment?.paidAt?.getTime(),
    savedOrder.paidAt.getTime(),
  );
  assert.equal(savedPayment?.failureCode, null);
  assert.equal(savedPayment?.failureReason, null);
});

test("completes a payment before the order expires", async () => {
  const user = await createUser("complete-before-expiration");
  const order = await createOrder(user.id, {
    expiresAt: new Date(Date.now() + 60_000),
  });
  const service = serviceFor(user.id);
  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName(
      "complete-before-expiration-key",
    ),
  });

  const completed = await service.completeMockPayment({
    orderNumber: order.orderNumber,
    paymentId: started.payment.id,
  });

  assert.equal(completed.order.status, "PAID");
  assert.equal(completed.payment.status, "SUCCEEDED");
});

test("rejects completion after expiration and rolls back every write", async () => {
  const user = await createUser("complete-after-expiration");
  const category = await prisma.category.create({
    data: {
      name: "Expired Payment Category",
      slug: nextFixtureName("expired-payment-category"),
    },
  });
  const product = await prisma.product.create({
    data: {
      name: "Expired Payment Product",
      slug: nextFixtureName("expired-payment-product"),
      price: 2_500,
      stock: 6,
      categoryId: category.id,
    },
  });
  const order = await createOrder(user.id, {
    expiresAt: new Date(fixedNow.getTime() - 1),
  });
  await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: product.id,
      productName: product.name,
      unitPrice: 2_500,
      quantity: 1,
      subtotal: 2_500,
    },
  });
  const payment = await createMockPayment(order.id);

  await assert.rejects(
    serviceFor(user.id).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }),
    (error) => {
      assertPaymentError(error, "ORDER_EXPIRED");
      return true;
    },
  );

  const [savedOrder, savedPayment, savedProduct] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ]);
  assert.equal(savedOrder.status, "PENDING_PAYMENT");
  assert.equal(savedOrder.paidAt, null);
  assert.equal(savedPayment.status, "PENDING");
  assert.equal(savedPayment.paidAt, null);
  assert.equal(savedProduct.stock, 6);
  assert.equal(
    await prisma.payment.count({
      where: { orderId: order.id, status: "SUCCEEDED" },
    }),
    0,
  );
});

test("rejects completion exactly at the order expiration", async () => {
  const user = await createUser("complete-exact-expiration");
  const order = await createOrder(user.id, {
    expiresAt: fixedNow,
  });
  const payment = await createMockPayment(order.id);

  await assert.rejects(
    serviceFor(user.id).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }),
    (error) => {
      assertPaymentError(error, "ORDER_EXPIRED");
      return true;
    },
  );
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    })).status,
    "PENDING",
  );
});

test("uses database execution time for the exact expiration boundary", async () => {
  const databaseNowMs = Number(await readDatabaseNowMs());
  const user = await createUser("complete-database-exact-expiration");
  const order = await createOrder(user.id, {
    expiresAt: new Date(databaseNowMs),
  });
  const payment = await createMockPayment(order.id);

  await assert.rejects(
    serviceFor(
      user.id,
      prisma,
      () => new Date(databaseNowMs - 60_000),
    ).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }),
    (error) => {
      assertPaymentError(error, "ORDER_EXPIRED");
      return true;
    },
  );
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    })).status,
    "PENDING",
  );
});

test("does not let a stale application clock reject a live database window", async () => {
  const databaseNowMs = Number(await readDatabaseNowMs());
  const user = await createUser("complete-stale-future-clock");
  const order = await createOrder(user.id, {
    expiresAt: new Date(databaseNowMs + 60_000),
  });
  const payment = await createMockPayment(order.id);

  const result = await serviceFor(
    user.id,
    prisma,
    () => new Date("2099-01-01T00:00:00.000Z"),
  ).completeMockPayment({
    orderNumber: order.orderNumber,
    paymentId: payment.id,
  });

  assert.equal(result.order.status, "PAID");
  assert.equal(result.payment.status, "SUCCEEDED");
  assert.ok(result.order.paidAt);
  assert.ok(
    result.order.paidAt.getTime() >= databaseNowMs,
  );
  assert.ok(
    result.order.paidAt.getTime() <
      databaseNowMs + 60_000,
  );
});

test("does not pay when the deadline passes during completion", async () => {
  const user = await createUser("complete-deadline-race");
  const expiration = new Date(fixedNow.getTime() + 1_000);
  const order = await createOrder(user.id, {
    expiresAt: expiration,
  });
  const payment = await createMockPayment(order.id);
  let currentTime = fixedNow;
  const racingClient = createInterceptedPrisma(
    ({ model, action }) => {
      if (model === "payment" && action === "findMany") {
        currentTime = expiration;
      }

      return undefined;
    },
  );

  await assert.rejects(
    serviceFor(
      user.id,
      racingClient,
      () => currentTime,
    ).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }),
    (error) => {
      assertPaymentError(error, "ORDER_EXPIRED");
      return true;
    },
  );
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    })).status,
    "PENDING",
  );
});

test("rejects after application time sampling when a real write lock spans the deadline", async () => {
  const lockTestPrisma = new PrismaClient({
    datasources: {
      db: {
        url: `${testDatabase.databaseUrl}?connection_limit=1`,
      },
    },
  });
  await lockTestPrisma.$queryRawUnsafe(
    "PRAGMA journal_mode = WAL",
  );
  await lockTestPrisma.$queryRawUnsafe(
    "PRAGMA busy_timeout = 10000",
  );

  const user = await createUser("complete-real-lock-wait");
  const expirationMs = Date.now() + 2_000;
  const expiresAt = new Date(expirationMs);
  const order = await createOrder(user.id, { expiresAt });
  const payment = await createMockPayment(order.id);
  const releaseAt = expirationMs + 400;
  const writeLock = await createSqliteWriteLock({
    databasePath: testDatabase.databaseUrl.slice("file:".length),
    orderId: order.id,
    releaseAt,
  });
  let sampledAt = 0;
  let acquired = false;
  let completionError: unknown;

  try {
    const completion = serviceFor(user.id, lockTestPrisma, () => {
      sampledAt = Date.now();

      if (!acquired) {
        acquired = true;
        writeLock.acquire();
      }

      return new Date(sampledAt);
    }).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    });

    completionError = await completion.then(
      () => undefined,
      (error: unknown) => error,
    );
    await writeLock.released;
    assertPaymentError(completionError, "ORDER_EXPIRED");
    assert.ok(sampledAt > 0);
    assert.ok(sampledAt < expirationMs);
    assert.ok(Date.now() > expirationMs);
    assert.equal(
      (
        await prisma.order.findUniqueOrThrow({
          where: { id: order.id },
        })
      ).status,
      "PENDING_PAYMENT",
    );
    assert.equal(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        })
      ).status,
      "PENDING",
    );
  } finally {
    await writeLock.close();
    await lockTestPrisma.$disconnect();
  }
});

test("guards the final order update with the payment deadline", async () => {
  const user = await createUser("complete-final-deadline-guard");
  const order = await createOrder(user.id, {
    expiresAt: new Date(Date.now() + 60_000),
  });
  const payment = await createMockPayment(order.id);
  let guardFound = false;
  const guardedClient = createInterceptedPrisma(
    ({ model, action, args }) => {
      if (model === "$queryRaw" && action === "query") {
        const sql = (args[0] as { sql?: string }).sql ?? "";
        guardFound =
          sql.includes('"expiresAt" IS NULL') &&
          sql.includes(
            "unixepoch('now', 'subsec')",
          ) &&
          sql.includes(
            '"expiresAt" > (SELECT "nowMs" FROM "db_clock")',
          );
      }

      return undefined;
    },
  );

  await serviceFor(user.id, guardedClient).completeMockPayment({
    orderNumber: order.orderNumber,
    paymentId: payment.id,
  });

  assert.equal(guardFound, true);
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PAID",
  );
});

test("returns the existing successful result for a repeated completion", async () => {
  const user = await createUser("complete-idempotent");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("complete-idempotent-key"),
  });
  const input = {
    orderNumber: order.orderNumber,
    paymentId: started.payment.id,
  };

  const first = await service.completeMockPayment(input);
  const orderAfterFirst = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });
  const second = await service.completeMockPayment(input);
  const orderAfterSecond = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });

  assert.equal(second.payment.id, first.payment.id);
  assert.equal(second.payment.status, "SUCCEEDED");
  assert.equal(
    second.order.paidAt?.getTime(),
    first.order.paidAt?.getTime(),
  );
  assert.equal(
    orderAfterSecond.updatedAt.getTime(),
    orderAfterFirst.updatedAt.getTime(),
  );
});

test("keeps successful completion idempotent after the order expires", async () => {
  const user = await createUser("complete-idempotent-expired");
  const order = await createOrder(user.id, {
    status: "PAID",
    paidAt: fixedNow,
    expiresAt: new Date(fixedNow.getTime() - 1),
  });
  const payment = await createMockPayment(order.id, {
    status: "SUCCEEDED",
    paidAt: fixedNow,
  });

  const result = await serviceFor(user.id).completeMockPayment({
    orderNumber: order.orderNumber,
    paymentId: payment.id,
  });

  assert.equal(result.order.status, "PAID");
  assert.equal(result.payment.status, "SUCCEEDED");
});

test("cancels other pending mock attempts after a successful payment", async () => {
  const user = await createUser("complete-cancels-others");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const target = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("complete-target-key"),
  });
  const otherMock = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("complete-other-key"),
  });
  const otherProvider = await createMockPayment(order.id, {
    provider: "STRIPE",
    method: "CARD",
  });

  await service.completeMockPayment({
    orderNumber: order.orderNumber,
    paymentId: target.payment.id,
  });

  assert.equal(
    (
      await prisma.payment.findUniqueOrThrow({
        where: { id: otherMock.payment.id },
      })
    ).status,
    "CANCELLED",
  );
  assert.equal(
    (
      await prisma.payment.findUniqueOrThrow({
        where: { id: otherProvider.id },
      })
    ).status,
    "PENDING",
  );
});

test("rejects completion when payment amount or currency differs from the order", async () => {
  const user = await createUser("complete-mismatch");
  const order = await createOrder(user.id, {
    totalAmount: 3_000,
    currency: "CNY",
  });
  const service = serviceFor(user.id);
  const wrongAmount = await createMockPayment(order.id, {
    amount: 2_999,
  });
  const wrongCurrency = await createMockPayment(order.id, {
    amount: 3_000,
    currency: "USD",
  });

  await assert.rejects(
    service.completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: wrongAmount.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_AMOUNT_MISMATCH");
      return true;
    },
  );
  await assert.rejects(
    service.completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: wrongCurrency.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_CURRENCY_MISMATCH");
      return true;
    },
  );
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
});

test("rejects non-mock provider or method during completion", async () => {
  const user = await createUser("complete-provider-method");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const wrongProvider = await createMockPayment(order.id, {
    provider: "STRIPE",
  });
  const wrongMethod = await createMockPayment(order.id, {
    method: "CARD",
  });

  await assert.rejects(
    service.completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: wrongProvider.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_PROVIDER_MISMATCH");
      return true;
    },
  );
  await assert.rejects(
    service.completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: wrongMethod.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_METHOD_MISMATCH");
      return true;
    },
  );
});

test("does not allow a user to complete another user's payment", async () => {
  const user = await createUser("complete-owner");
  const otherUser = await createUser("complete-owner-other");
  const order = await createOrder(otherUser.id);
  const payment = await createMockPayment(order.id);

  await assert.rejects(
    serviceFor(user.id).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }),
    (error) => {
      assertPaymentError(error, "ORDER_NOT_FOUND");
      return true;
    },
  );
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    })).status,
    "PENDING",
  );
});

test("rejects completion for cancelled orders and non-pending payments", async () => {
  const user = await createUser("complete-invalid-state");
  const service = serviceFor(user.id);
  const cancelledOrder = await createOrder(user.id, {
    status: "CANCELLED",
  });
  const pendingForCancelled = await createMockPayment(
    cancelledOrder.id,
  );
  const pendingOrder = await createOrder(user.id);
  const failedPayment = await createMockPayment(pendingOrder.id, {
    status: "FAILED",
  });
  const cancelledPayment = await createMockPayment(pendingOrder.id, {
    status: "CANCELLED",
  });

  await assert.rejects(
    service.completeMockPayment({
      orderNumber: cancelledOrder.orderNumber,
      paymentId: pendingForCancelled.id,
    }),
    (error) => {
      assertPaymentError(error, "ORDER_NOT_PAYABLE");
      return true;
    },
  );

  for (const payment of [failedPayment, cancelledPayment]) {
    await assert.rejects(
      service.completeMockPayment({
        orderNumber: pendingOrder.orderNumber,
        paymentId: payment.id,
      }),
      (error) => {
        assertPaymentError(error, "PAYMENT_NOT_PENDING");
        return true;
      },
    );
  }
});

test("refuses a paid order without a successful target payment", async () => {
  const user = await createUser("complete-state-conflict");
  const order = await createOrder(user.id, {
    status: "PAID",
    paidAt: new Date("2026-08-01T00:00:00.000Z"),
  });
  const target = await createMockPayment(order.id);

  await assert.rejects(
    serviceFor(user.id).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: target.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_STATE_CONFLICT");
      return true;
    },
  );
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({
      where: { id: target.id },
    })).status,
    "PENDING",
  );
});

test("refuses inconsistent orders that already have multiple successful payments", async () => {
  const user = await createUser("complete-multiple-success");
  const order = await createOrder(user.id, {
    status: "PAID",
    paidAt: fixedNow,
  });
  const target = await createMockPayment(order.id, {
    status: "SUCCEEDED",
    paidAt: fixedNow,
  });
  await createMockPayment(order.id, {
    status: "SUCCEEDED",
    paidAt: fixedNow,
  });

  await assert.rejects(
    serviceFor(user.id).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: target.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_STATE_CONFLICT");
      return true;
    },
  );
});

test("allows at most one of two concurrent payment attempts to succeed", async () => {
  const user = await createUser("complete-concurrent");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const first = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("concurrent-complete-one"),
  });
  const second = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("concurrent-complete-two"),
  });

  const results = await Promise.allSettled([
    service.completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: first.payment.id,
    }),
    service.completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: second.payment.id,
    }),
  ]);
  const fulfilled = results.filter(
    (result) => result.status === "fulfilled",
  );
  const rejected = results.filter(
    (result) => result.status === "rejected",
  );

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(
    await prisma.payment.count({
      where: { orderId: order.id, status: "SUCCEEDED" },
    }),
    1,
  );
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PAID",
  );
});

test("rolls back order and payment updates when a later transaction step fails", async () => {
  const user = await createUser("complete-rollback");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("complete-rollback-key"),
  });
  const failingClient = createInterceptedPrisma(
    ({ model, action, args }) => {
      if (
        model === "payment" &&
        action === "updateMany" &&
        (args[0] as { data?: { status?: string } })?.data?.status ===
          "CANCELLED"
      ) {
        throw new Error("injected cancellation failure");
      }

      return undefined;
    },
  );

  await assert.rejects(
    serviceFor(user.id, failingClient).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: started.payment.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_OPERATION_FAILED");
      return true;
    },
  );

  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
  assert.equal(
    (
      await prisma.payment.findUniqueOrThrow({
        where: { id: started.payment.id },
      })
    ).status,
    "PENDING",
  );
});

test("rolls back the paid order when the payment update fails", async () => {
  const user = await createUser("complete-payment-update-failure");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName(
      "complete-payment-update-failure-key",
    ),
  });
  const failingClient = createInterceptedPrisma(
    ({ model, action, args }) => {
      if (
        model === "payment" &&
        action === "updateMany" &&
        (args[0] as { data?: { status?: string } })?.data?.status ===
          "SUCCEEDED"
      ) {
        throw new Error("injected payment update failure");
      }

      return undefined;
    },
  );

  await assert.rejects(
    serviceFor(user.id, failingClient).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: started.payment.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_OPERATION_FAILED");
      return true;
    },
  );

  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
  assert.equal(
    (
      await prisma.payment.findUniqueOrThrow({
        where: { id: started.payment.id },
      })
    ).status,
    "PENDING",
  );
});

test("rolls back the transaction when the final result read fails", async () => {
  const user = await createUser("complete-final-read-failure");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName(
      "complete-final-read-failure-key",
    ),
  });
  let orderReadCount = 0;
  const failingClient = createInterceptedPrisma(
    ({ model, action }) => {
      if (model === "order" && action === "findFirst") {
        orderReadCount += 1;

        if (orderReadCount === 2) {
          throw new Error("injected final read failure");
        }
      }

      return undefined;
    },
  );

  await assert.rejects(
    serviceFor(user.id, failingClient).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: started.payment.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_OPERATION_FAILED");
      return true;
    },
  );

  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
  assert.equal(
    (
      await prisma.payment.findUniqueOrThrow({
        where: { id: started.payment.id },
      })
    ).status,
    "PENDING",
  );
});

test("limits retries for persistent SQLite lock conflicts", async () => {
  const user = await createUser("complete-retry-limit");
  const order = await createOrder(user.id);
  const providerService = serviceFor(user.id);
  const started = await providerService.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("retry-limit-key"),
  });
  let attempts = 0;
  const busyClient = createInterceptedPrisma(
    ({ model, action }) => {
      if (model === "order" && action === "findFirst") {
        attempts += 1;
        throw new Error("database is locked");
      }

      return undefined;
    },
  );

  await assert.rejects(
    serviceFor(user.id, busyClient).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: started.payment.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_BUSY");
      return true;
    },
  );
  assert.equal(attempts, 5);
});

test("fails a pending mock payment without changing the order or stock", async () => {
  const user = await createUser("fail-success");
  const category = await prisma.category.create({
    data: {
      name: "Payment Stock Category",
      slug: nextFixtureName("payment-stock-category"),
    },
  });
  const product = await prisma.product.create({
    data: {
      name: "Payment Stock Product",
      slug: nextFixtureName("payment-stock-product"),
      price: 2_500,
      stock: 7,
      categoryId: category.id,
    },
  });
  const order = await createOrder(user.id);
  const payment = await createMockPayment(order.id);

  const result = await serviceFor(user.id).failMockPayment({
    orderNumber: order.orderNumber,
    paymentId: payment.id,
    failureCode: "MOCK_USER_DECLINED",
    failureReason: "arbitrary client reason",
    status: "CANCELLED",
    userId: "forged-user",
  } as Parameters<
    ReturnType<typeof serviceFor>["failMockPayment"]
  >[0]);
  const savedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });
  const savedPayment = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
  });

  assert.equal(result.payment.status, "FAILED");
  assert.equal(savedOrder.status, "PENDING_PAYMENT");
  assert.equal(savedOrder.paidAt, null);
  assert.equal(savedPayment.status, "FAILED");
  assert.equal(savedPayment.failureCode, "MOCK_USER_DECLINED");
  assert.equal(
    savedPayment.failureReason,
    "模拟支付被用户拒绝",
  );
  assert.equal(savedPayment.paidAt, null);
  assert.equal(
    (
      await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      })
    ).stock,
    7,
  );
});

test("rejects failure codes outside the server whitelist", async () => {
  const user = await createUser("fail-invalid-code");
  const order = await createOrder(user.id);
  const payment = await createMockPayment(order.id);
  const service = serviceFor(user.id);

  for (const failureCode of [
    "UNKNOWN",
    "MOCK_RAW_ERROR",
    "",
    null,
  ]) {
    await assert.rejects(
      service.failMockPayment({
        orderNumber: order.orderNumber,
        paymentId: payment.id,
        failureCode,
      } as Parameters<
        ReturnType<typeof serviceFor>["failMockPayment"]
      >[0]),
      (error) => {
        assertPaymentError(error, "INVALID_FAILURE_CODE");
        return true;
      },
    );
  }
  assert.equal(
    (await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    })).status,
    "PENDING",
  );
});

test("does not fail a successful or cancelled payment", async () => {
  const user = await createUser("fail-invalid-state");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const successful = await createMockPayment(order.id, {
    status: "SUCCEEDED",
    paidAt: fixedNow,
  });
  const cancelled = await createMockPayment(order.id, {
    status: "CANCELLED",
  });

  for (const payment of [successful, cancelled]) {
    await assert.rejects(
      service.failMockPayment({
        orderNumber: order.orderNumber,
        paymentId: payment.id,
        failureCode: "MOCK_PAYMENT_FAILED",
      }),
      (error) => {
        assertPaymentError(error, "PAYMENT_NOT_PENDING");
        return true;
      },
    );
  }
});

test("does not fail a payment after its order has left pending payment", async () => {
  const user = await createUser("fail-order-not-payable");
  const order = await createOrder(user.id, {
    status: "CANCELLED",
  });
  const payment = await createMockPayment(order.id);

  await assert.rejects(
    serviceFor(user.id).failMockPayment({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
      failureCode: "MOCK_PAYMENT_TIMEOUT",
    }),
    (error) => {
      assertPaymentError(error, "ORDER_NOT_PAYABLE");
      return true;
    },
  );
});

test("rejects non-mock payments and other users' payments on failure", async () => {
  const user = await createUser("fail-isolation");
  const otherUser = await createUser("fail-isolation-other");
  const order = await createOrder(user.id);
  const wrongProvider = await createMockPayment(order.id, {
    provider: "STRIPE",
  });
  const wrongMethod = await createMockPayment(order.id, {
    method: "CARD",
  });
  const otherOrder = await createOrder(otherUser.id);
  const otherPayment = await createMockPayment(otherOrder.id);
  const service = serviceFor(user.id);

  for (const payment of [wrongProvider, wrongMethod]) {
    await assert.rejects(
      service.failMockPayment({
        orderNumber: order.orderNumber,
        paymentId: payment.id,
        failureCode: "MOCK_PAYMENT_FAILED",
      }),
      (error) => {
        assertPaymentError(
          error,
          payment === wrongProvider
            ? "PAYMENT_PROVIDER_MISMATCH"
            : "PAYMENT_METHOD_MISMATCH",
        );
        return true;
      },
    );
  }
  await assert.rejects(
    service.failMockPayment({
      orderNumber: otherOrder.orderNumber,
      paymentId: otherPayment.id,
      failureCode: "MOCK_PAYMENT_FAILED",
    }),
    (error) => {
      assertPaymentError(error, "ORDER_NOT_FOUND");
      return true;
    },
  );
});

test("allows a new attempt after a failed payment", async () => {
  const user = await createUser("fail-then-retry");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const first = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("fail-then-retry-one"),
  });

  await service.failMockPayment({
    orderNumber: order.orderNumber,
    paymentId: first.payment.id,
    failureCode: "MOCK_PAYMENT_TIMEOUT",
  });
  const second = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("fail-then-retry-two"),
  });

  assert.notEqual(second.payment.id, first.payment.id);
  assert.equal(second.payment.status, "PENDING");
  assert.equal(
    (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
      .status,
    "PENDING_PAYMENT",
  );
});

test("turns unexpected internal errors into a safe operation failure", async () => {
  const user = await createUser("complete-unknown-error");
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("unknown-error-key"),
  });
  const failingClient = createInterceptedPrisma(
    ({ model, action }) => {
      if (model === "$queryRaw" && action === "query") {
        throw new Error("SELECT secret FROM internal_table");
      }

      return undefined;
    },
  );

  await assert.rejects(
    serviceFor(user.id, failingClient).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: started.payment.id,
    }),
    (error) => {
      assertPaymentError(error, "PAYMENT_OPERATION_FAILED");
      return true;
    },
  );
});

test("does not change stock when a payment succeeds", async () => {
  const user = await createUser("complete-stock");
  const category = await prisma.category.create({
    data: {
      name: "Successful Payment Category",
      slug: nextFixtureName("successful-payment-category"),
    },
  });
  const product = await prisma.product.create({
    data: {
      name: "Successful Payment Product",
      slug: nextFixtureName("successful-payment-product"),
      price: 2_500,
      stock: 6,
      categoryId: category.id,
    },
  });
  const order = await createOrder(user.id);
  const service = serviceFor(user.id);
  const started = await service.startMockPayment({
    orderNumber: order.orderNumber,
    idempotencyKey: nextFixtureName("complete-stock-key"),
  });

  await service.completeMockPayment({
    orderNumber: order.orderNumber,
    paymentId: started.payment.id,
  });

  assert.equal(
    (
      await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      })
    ).stock,
    6,
  );
});


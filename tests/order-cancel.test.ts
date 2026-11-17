import assert from "node:assert/strict";
import test from "node:test";

import {
  Prisma,
  type PrismaClient,
  type Product,
  type User,
} from "@prisma/client";

import {
  OrderCancelError,
  createOrderCancelService,
  type OrderCancelErrorCode,
} from "../src/lib/order-cancel-service";
import { createPaymentService } from "../src/lib/payment-service";
import { createIsolatedOrderCancelTestDatabase } from "./helpers/test-database";

const testDatabase = createIsolatedOrderCancelTestDatabase();
const prisma = testDatabase.prisma;
const testPrefix = `phase06-6-3-order-cancel-${process.pid}-${Date.now()}`;
const fixedNow = new Date("2026-11-16T09:30:00.000Z");
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
      name: `Order Cancel Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-order-cancel-tests",
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
      name: `Order Cancel Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });

  return prisma.product.create({
    data: {
      name: `Order Cancel Product ${label}`,
      slug: `${fixture}-product`,
      price,
      stock,
      categoryId: category.id,
    },
  });
}

async function createOrder({
  userId,
  status = "PENDING_PAYMENT",
  paidAt = null,
  cancelledAt = null,
  items = [],
}: {
  userId: string;
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
      orderNumber: `${fixture}-number`,
      userId,
      checkoutKey: `${fixture}-checkout`,
      itemsAmount,
      shippingAmount: 0,
      discountAmount: 0,
      totalAmount: itemsAmount,
      currency: "CNY",
      status,
      paidAt,
      cancelledAt,
      shippingName: "订单取消测试收件人",
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
  overrides: {
    amount?: number;
    idempotencyKey?: string | null;
  } = {},
) {
  return prisma.payment.create({
    data: {
      orderId,
      amount: overrides.amount ?? 1_000,
      currency: "CNY",
      status,
      provider: "MOCK",
      method: "MOCK",
      idempotencyKey:
        overrides.idempotencyKey === undefined
          ? nextFixtureName("payment-key")
          : overrides.idempotencyKey,
      paidAt: status === "SUCCEEDED" ? fixedNow : null,
    },
  });
}

function orderCancelServiceFor(
  userId: string | null,
  client: PrismaClient = prisma,
) {
  return createOrderCancelService({
    prisma: client,
    getCurrentUserId: async () => userId,
    now: () => fixedNow,
  });
}

function paymentServiceFor(userId: string) {
  return createPaymentService({
    prisma,
    getCurrentUserId: async () => userId,
    now: () => fixedNow,
  });
}

function assertOrderCancelError(
  error: unknown,
  code: OrderCancelErrorCode,
) {
  assert.ok(error instanceof OrderCancelError);
  assert.equal(error.code, code);
  assert.doesNotMatch(
    error.message,
    /SQL|Prisma|stack|SELECT|INSERT|UPDATE|session/i,
  );
}

function createInterceptedPrisma(
  interceptor: OperationInterceptor,
): PrismaClient {
  function wrapTransaction(transaction: Prisma.TransactionClient) {
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

test.after(async () => {
  await testDatabase.cleanup();
});

test("rejects cancellation when no user is signed in", async () => {
  const user = await createUser("unauthenticated");
  const order = await createOrder({ userId: user.id });

  await assert.rejects(
    orderCancelServiceFor(null).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    (error) => {
      assertOrderCancelError(error, "UNAUTHENTICATED");
      return true;
    },
  );
});

test("cancels a pending order and writes the server cancellation time", async () => {
  const user = await createUser("cancel-success");
  const product = await createProduct({
    label: "cancel-success",
    stock: 3,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const pendingPayment = await createPayment(order.id, "PENDING");

  const result = await orderCancelServiceFor(user.id).cancelOrder({
    orderNumber: order.orderNumber,
  });
  const savedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });
  const savedPayment = await prisma.payment.findUniqueOrThrow({
    where: { id: pendingPayment.id },
  });
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });

  assert.equal(result.outcome, "CANCELLED");
  assert.equal(result.alreadyCancelled, false);
  assert.equal(result.restoredItemCount, 1);
  assert.equal(result.cancelledPaymentCount, 1);
  assert.equal(savedOrder.status, "CANCELLED");
  assert.equal(savedOrder.cancelledAt?.toISOString(), fixedNow.toISOString());
  assert.equal(savedPayment.status, "CANCELLED");
  assert.equal(savedProduct.stock, 5);
});

test("restores stock for every order item using the database quantities", async () => {
  const user = await createUser("multi-item");
  const firstProduct = await createProduct({
    label: "multi-item-first",
    stock: 4,
  });
  const secondProduct = await createProduct({
    label: "multi-item-second",
    stock: 8,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: firstProduct.id,
        productName: firstProduct.name,
        quantity: 2,
        unitPrice: firstProduct.price,
      },
      {
        productId: secondProduct.id,
        productName: secondProduct.name,
        quantity: 3,
        unitPrice: secondProduct.price,
      },
    ],
  });

  await orderCancelServiceFor(user.id).cancelOrder({
    orderNumber: order.orderNumber,
  });

  const [savedFirst, savedSecond] = await Promise.all([
    prisma.product.findUniqueOrThrow({ where: { id: firstProduct.id } }),
    prisma.product.findUniqueOrThrow({ where: { id: secondProduct.id } }),
  ]);

  assert.equal(savedFirst.stock, 6);
  assert.equal(savedSecond.stock, 11);
});

test("repeated cancellation is idempotent and does not restore stock twice", async () => {
  const user = await createUser("duplicate");
  const product = await createProduct({
    label: "duplicate",
    stock: 2,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const service = orderCancelServiceFor(user.id);

  await service.cancelOrder({ orderNumber: order.orderNumber });
  const repeated = await service.cancelOrder({
    orderNumber: order.orderNumber,
  });
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });

  assert.equal(repeated.outcome, "ALREADY_CANCELLED");
  assert.equal(repeated.alreadyCancelled, true);
  assert.equal(repeated.restoredItemCount, 0);
  assert.equal(savedProduct.stock, 4);
});

test("does not let a different user cancel an order", async () => {
  const owner = await createUser("foreign-owner");
  const otherUser = await createUser("foreign-other");
  const product = await createProduct({
    label: "foreign",
    stock: 2,
  });
  const order = await createOrder({
    userId: owner.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
      },
    ],
  });

  await assert.rejects(
    orderCancelServiceFor(otherUser.id).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    (error) => {
      assertOrderCancelError(error, "ORDER_FORBIDDEN");
      return true;
    },
  );

  const [savedOrder, savedProduct] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
  ]);
  assert.equal(savedOrder.status, "PENDING_PAYMENT");
  assert.equal(savedOrder.cancelledAt, null);
  assert.equal(savedProduct.stock, 2);
});

test("rejects cancellation of an already paid order", async () => {
  const user = await createUser("paid");
  const product = await createProduct({
    label: "paid",
    stock: 2,
  });
  const order = await createOrder({
    userId: user.id,
    status: "PAID",
    paidAt: fixedNow,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
      },
    ],
  });

  await assert.rejects(
    orderCancelServiceFor(user.id).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    (error) => {
      assertOrderCancelError(error, "ORDER_NOT_CANCELLABLE");
      return true;
    },
  );

  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  assert.equal(savedProduct.stock, 2);
});

test("rolls back when a successful payment exists", async () => {
  const user = await createUser("successful-payment");
  const product = await createProduct({
    label: "successful-payment",
    stock: 3,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const successful = await createPayment(order.id, "SUCCEEDED");
  const pending = await createPayment(order.id, "PENDING");

  await assert.rejects(
    orderCancelServiceFor(user.id).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    (error) => {
      assertOrderCancelError(error, "SUCCESSFUL_PAYMENT_EXISTS");
      return true;
    },
  );

  const [savedOrder, savedProduct, savedSuccessful, savedPending] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.payment.findUniqueOrThrow({ where: { id: successful.id } }),
      prisma.payment.findUniqueOrThrow({ where: { id: pending.id } }),
    ]);
  assert.equal(savedOrder.status, "PENDING_PAYMENT");
  assert.equal(savedOrder.cancelledAt, null);
  assert.equal(savedProduct.stock, 3);
  assert.equal(savedSuccessful.status, "SUCCEEDED");
  assert.equal(savedPending.status, "PENDING");
});

test("cancels every pending payment and preserves terminal payments", async () => {
  const user = await createUser("payment-statuses");
  const order = await createOrder({ userId: user.id });
  const firstPending = await createPayment(order.id, "PENDING");
  const secondPending = await createPayment(order.id, "PENDING");
  const failed = await createPayment(order.id, "FAILED");
  const refunded = await createPayment(order.id, "REFUNDED");

  const result = await orderCancelServiceFor(user.id).cancelOrder({
    orderNumber: order.orderNumber,
  });
  const payments = await prisma.payment.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "asc" },
  });
  const statuses = new Map(
    payments.map((payment) => [payment.id, payment.status]),
  );

  assert.equal(result.cancelledPaymentCount, 2);
  assert.equal(statuses.get(firstPending.id), "CANCELLED");
  assert.equal(statuses.get(secondPending.id), "CANCELLED");
  assert.equal(statuses.get(failed.id), "FAILED");
  assert.equal(statuses.get(refunded.id), "REFUNDED");
});

test("rolls back order, payment, and inventory when stock restoration fails", async () => {
  const user = await createUser("stock-failure");
  const product = await createProduct({
    label: "stock-failure",
    stock: 3,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const pending = await createPayment(order.id, "PENDING");
  const failingClient = createInterceptedPrisma(
    ({ model, action }) => {
      if (model === "product" && action === "updateMany") {
        throw new Error("injected stock restoration failure");
      }

      return undefined;
    },
  );

  await assert.rejects(
    orderCancelServiceFor(user.id, failingClient).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    (error) => {
      assertOrderCancelError(error, "STOCK_RESTORE_FAILED");
      return true;
    },
  );

  const [savedOrder, savedProduct, savedPayment] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
      prisma.payment.findUniqueOrThrow({ where: { id: pending.id } }),
    ]);
  assert.equal(savedOrder.status, "PENDING_PAYMENT");
  assert.equal(savedOrder.cancelledAt, null);
  assert.equal(savedProduct.stock, 3);
  assert.equal(savedPayment.status, "PENDING");
});

test("two concurrent cancellation requests restore stock only once", async () => {
  const user = await createUser("concurrent-cancel");
  const product = await createProduct({
    label: "concurrent-cancel",
    stock: 1,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const service = orderCancelServiceFor(user.id);

  const results = await Promise.all([
    service.cancelOrder({ orderNumber: order.orderNumber }),
    service.cancelOrder({ orderNumber: order.orderNumber }),
  ]);
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });

  assert.deepEqual(
    results.map((result) => result.outcome).sort(),
    ["ALREADY_CANCELLED", "CANCELLED"],
  );
  assert.equal(savedProduct.stock, 3);
});

test("cancellation and successful payment converge on one legal final state", async () => {
  const user = await createUser("cancel-payment-race");
  const product = await createProduct({
    label: "cancel-payment-race",
    stock: 3,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });
  const payment = await createPayment(order.id, "PENDING", {
    amount: 2_000,
  });

  const [cancelResult, paymentResult] = await Promise.allSettled([
    orderCancelServiceFor(user.id).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    paymentServiceFor(user.id).completeMockPayment({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
    }),
  ]);

  assert.equal(
    [cancelResult, paymentResult].filter(
      (result) => result.status === "fulfilled",
    ).length,
    1,
  );

  const [savedOrder, savedPayment, savedProduct] =
    await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: product.id } }),
    ]);

  if (cancelResult.status === "fulfilled") {
    assert.equal(savedOrder.status, "CANCELLED");
    assert.equal(savedPayment.status, "CANCELLED");
    assert.equal(savedProduct.stock, 5);
  } else {
    assert.equal(paymentResult.status, "fulfilled");
    assert.equal(savedOrder.status, "PAID");
    assert.equal(savedPayment.status, "SUCCEEDED");
    assert.equal(savedProduct.stock, 3);
  }
});

test("maps unexpected internal failures to a non-leaking error", async () => {
  const user = await createUser("safe-error");
  const order = await createOrder({ userId: user.id });
  const failingClient = createInterceptedPrisma(
    ({ model, action }) => {
      if (model === "order" && action === "findFirst") {
        throw new Error(
          "SQL SELECT failed for session secret@example.com",
        );
      }

      return undefined;
    },
  );

  await assert.rejects(
    orderCancelServiceFor(user.id, failingClient).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    (error) => {
      assertOrderCancelError(error, "ORDER_CANCEL_FAILED");
      return true;
    },
  );
});

test("retries SQLite lock conflicts a finite number of times", async () => {
  const user = await createUser("locked");
  const order = await createOrder({ userId: user.id });
  let attempts = 0;
  const lockedClient = new Proxy(prisma, {
    get(target, property, receiver) {
      if (property === "$transaction") {
        return async () => {
          attempts += 1;
          throw new Error("database is locked");
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function"
        ? value.bind(target)
        : value;
    },
  }) as PrismaClient;

  await assert.rejects(
    orderCancelServiceFor(user.id, lockedClient).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    (error) => {
      assertOrderCancelError(error, "ORDER_CANCEL_BUSY");
      return true;
    },
  );

  assert.equal(attempts, 5);
});

test("skips deleted products while restoring other order items", async () => {
  const user = await createUser("deleted-product");
  const product = await createProduct({
    label: "deleted-product-live",
    stock: 4,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: null,
        productName: "Deleted Product Snapshot",
        quantity: 2,
        unitPrice: 500,
      },
      {
        productId: product.id,
        productName: product.name,
        quantity: 1,
        unitPrice: product.price,
      },
    ],
  });

  const result = await orderCancelServiceFor(user.id).cancelOrder({
    orderNumber: order.orderNumber,
  });
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });

  assert.equal(result.outcome, "CANCELLED");
  assert.equal(result.restoredItemCount, 1);
  assert.equal(savedProduct.stock, 5);
});

test("rolls back when an order item has an invalid quantity", async () => {
  const user = await createUser("invalid-quantity");
  const product = await createProduct({
    label: "invalid-quantity",
    stock: 2,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 0,
        unitPrice: product.price,
      },
    ],
  });

  await assert.rejects(
    orderCancelServiceFor(user.id).cancelOrder({
      orderNumber: order.orderNumber,
    }),
    (error) => {
      assertOrderCancelError(error, "STOCK_RESTORE_FAILED");
      return true;
    },
  );

  const savedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  assert.equal(savedOrder.status, "PENDING_PAYMENT");
  assert.equal(savedProduct.stock, 2);
});

test("ignores forged cancellation state and stock fields", async () => {
  const user = await createUser("forged-fields");
  const product = await createProduct({
    label: "forged-fields",
    stock: 1,
  });
  const order = await createOrder({
    userId: user.id,
    items: [
      {
        productId: product.id,
        productName: product.name,
        quantity: 2,
        unitPrice: product.price,
      },
    ],
  });

  await orderCancelServiceFor(user.id).cancelOrder({
    orderNumber: order.orderNumber,
    status: "PAID",
    quantity: 99,
    stock: 1_000,
    cancelledAt: new Date("2000-01-01T00:00:00.000Z"),
  } as Parameters<
    ReturnType<typeof orderCancelServiceFor>["cancelOrder"]
  >[0]);

  const savedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });
  const savedProduct = await prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  assert.equal(savedOrder.status, "CANCELLED");
  assert.equal(savedOrder.cancelledAt?.toISOString(), fixedNow.toISOString());
  assert.equal(savedProduct.stock, 3);
});

test("returns a stable not-found error for a missing order number", async () => {
  const user = await createUser("missing-order");

  await assert.rejects(
    orderCancelServiceFor(user.id).cancelOrder({
      orderNumber: `${testPrefix}-does-not-exist`,
    }),
    (error) => {
      assertOrderCancelError(error, "ORDER_NOT_FOUND");
      return true;
    },
  );
});

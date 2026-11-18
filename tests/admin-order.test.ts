import assert from "node:assert/strict";
import test from "node:test";

import { createIsolatedAdminTestDatabase } from "./helpers/test-database";
import {
  normalizeAdminOrderSearchParams,
  normalizeAdminPaymentStatusFilter,
} from "../src/lib/admin-order";
import { createAdminOrderService } from "../src/lib/admin-order-service";
import {
  OrderCancelError,
  createOrderCancelService,
} from "../src/lib/order-cancel-service";

const database = createIsolatedAdminTestDatabase();
const adminOrders = createAdminOrderService({ prisma: database.prisma });
const orderCancellation = createOrderCancelService({
  prisma: database.prisma,
  getCurrentUserId: async () => null,
  now: () => new Date("2026-11-18T08:00:00.000Z"),
});
const fixture = `admin-order-${process.pid}-${Date.now()}`;

async function createOrderFixture({
  suffix,
  status = "PENDING_PAYMENT",
  paymentStatus,
  createdAt = new Date("2026-11-17T08:00:00.000Z"),
}: {
  suffix: string;
  status?: string;
  paymentStatus?: string;
  createdAt?: Date;
}) {
  const category = await database.prisma.category.create({
    data: {
      name: `管理订单分类 ${suffix}`,
      slug: `${fixture}-${suffix}-category`,
    },
  });
  const product = await database.prisma.product.create({
    data: {
      name: `管理订单商品 ${suffix}`,
      slug: `${fixture}-${suffix}-product`,
      price: 2_500,
      stock: 9,
      categoryId: category.id,
    },
  });
  const user = await database.prisma.user.create({
    data: {
      name: `订单用户 ${suffix}`,
      email: `${fixture}-${suffix}@example.com`,
      passwordHash: "not-used",
      role: "USER",
    },
  });
  const order = await database.prisma.order.create({
    data: {
      orderNumber: `${fixture}-${suffix}-order`,
      userId: user.id,
      itemsAmount: 5_000,
      shippingAmount: 0,
      discountAmount: 0,
      totalAmount: 5_000,
      status,
      paidAt:
        status === "PAID"
          ? new Date("2026-11-17T08:10:00.000Z")
          : null,
      createdAt,
      shippingName: "订单收件人",
      shippingPhone: "13800138000",
      shippingAddress: "浙江省杭州市西湖区测试路 1 号",
      shippingRecipientName: "订单收件人",
      shippingProvince: "浙江省",
      shippingCity: "杭州市",
      shippingDistrict: "西湖区",
      shippingAddressLine: "测试路 1 号",
      items: {
        create: {
          productId: product.id,
          productName: `管理订单商品 ${suffix}`,
          productSlug: product.slug,
          productImageUrl: null,
          unitPrice: 2_500,
          quantity: 2,
          subtotal: 5_000,
        },
      },
      payments: paymentStatus
        ? {
            create: {
              amount: 5_000,
              currency: "CNY",
              status: paymentStatus,
              method: "MOCK",
              provider: `provider-${fixture}-${suffix}`,
              providerPaymentId: `payment-${fixture}-${suffix}`,
              paidAt:
                paymentStatus === "SUCCEEDED"
                  ? new Date("2026-11-17T08:10:00.000Z")
                  : null,
            },
          }
        : undefined,
    },
  });

  return { order, product, user };
}

test.before(async () => {
  await database.initialize();
});

test.after(async () => {
  await database.cleanup();
});

test("normalizes order and payment filters", () => {
  assert.deepEqual(
    normalizeAdminOrderSearchParams({
      q: " ORD-1 ",
      status: "PAID",
      paymentStatus: "SUCCEEDED",
      page: "2",
    }),
    {
      q: "ORD-1",
      status: "PAID",
      paymentStatus: "SUCCEEDED",
      page: 2,
    },
  );
  assert.deepEqual(
    normalizeAdminOrderSearchParams({
      q: "",
      status: "INVALID",
      paymentStatus: "INVALID",
      page: "-3",
    }),
    {
      q: "",
      status: undefined,
      paymentStatus: undefined,
      page: 1,
    },
  );
  assert.equal(normalizeAdminPaymentStatusFilter("SUCCEEDED"), "SUCCEEDED");
  assert.equal(normalizeAdminPaymentStatusFilter("INVALID"), undefined);
});

test("returns dashboard counts from the database", async () => {
  await database.prisma.category.create({
    data: {
      name: "统计分类",
      slug: `${fixture}-stats-category`,
    },
  });
  await createOrderFixture({ suffix: "stats-pending" });
  await createOrderFixture({
    suffix: "stats-paid",
    status: "PAID",
    paymentStatus: "SUCCEEDED",
  });
  await createOrderFixture({
    suffix: "stats-cancelled",
    status: "CANCELLED",
  });

  const stats = await adminOrders.getDashboardStats();
  assert.ok(stats.productTotal >= 3);
  assert.ok(stats.categoryTotal >= 1);
  assert.equal(stats.orderTotal, 3);
  assert.equal(stats.pendingPaymentCount, 1);
  assert.equal(stats.paidCount, 1);
  assert.equal(stats.cancelledCount, 1);
});

test("lists orders with status and payment filters, search, and pagination", async () => {
  const pending = await createOrderFixture({
    suffix: "list-pending",
    paymentStatus: "PENDING",
    createdAt: new Date("2026-11-18T01:00:00.000Z"),
  });
  const paid = await createOrderFixture({
    suffix: "list-paid",
    status: "PAID",
    paymentStatus: "SUCCEEDED",
    createdAt: new Date("2026-11-18T02:00:00.000Z"),
  });

  const paidResult = await adminOrders.listOrders({
    q: paid.order.orderNumber,
    status: "PAID",
    paymentStatus: "SUCCEEDED",
    page: 1,
  });
  assert.equal(paidResult.totalCount, 1);
  assert.equal(paidResult.orders[0].orderNumber, paid.order.orderNumber);
  assert.equal(paidResult.orders[0].user.email, paid.user.email);
  assert.equal(paidResult.orders[0].paymentStatus, "SUCCEEDED");

  const pendingResult = await adminOrders.listOrders({
    q: pending.order.orderNumber,
    status: "PENDING_PAYMENT",
    paymentStatus: "PENDING",
    page: 1,
  });
  assert.equal(pendingResult.totalCount, 1);
  assert.equal(
    pendingResult.orders[0].orderNumber,
    pending.order.orderNumber,
  );
});

test("returns order detail with user, item snapshots, payments, and address snapshot", async () => {
  const paid = await createOrderFixture({
    suffix: "detail-paid",
    status: "PAID",
    paymentStatus: "SUCCEEDED",
  });
  const detail = await adminOrders.getOrderDetail(
    paid.order.orderNumber,
  );

  assert.ok(detail);
  assert.equal(detail.user.name, paid.user.name);
  assert.equal(detail.user.email, paid.user.email);
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0].productName, "管理订单商品 detail-paid");
  assert.equal(detail.payments.length, 1);
  assert.equal(detail.payments[0].status, "SUCCEEDED");
  assert.equal(detail.shipping.addressLine, "测试路 1 号");
});

test("admin cancellation obeys the order state machine and restores stock once", async () => {
  const pending = await createOrderFixture({
    suffix: "cancel-pending",
    paymentStatus: "PENDING",
  });
  const paid = await createOrderFixture({
    suffix: "cancel-paid",
    status: "PAID",
    paymentStatus: "SUCCEEDED",
  });

  const result = await orderCancellation.cancelOrderAsAdmin({
    orderNumber: pending.order.orderNumber,
  });
  const second = await orderCancellation.cancelOrderAsAdmin({
    orderNumber: pending.order.orderNumber,
  });
  const savedProduct = await database.prisma.product.findUniqueOrThrow({
    where: { id: pending.product.id },
  });

  assert.equal(result.outcome, "CANCELLED");
  assert.equal(result.restoredItemCount, 1);
  assert.equal(second.outcome, "ALREADY_CANCELLED");
  assert.equal(second.restoredItemCount, 0);
  assert.equal(savedProduct.stock, 11);

  await assert.rejects(
    orderCancellation.cancelOrderAsAdmin({
      orderNumber: paid.order.orderNumber,
    }),
    (error) => {
      assert.ok(error instanceof OrderCancelError);
      assert.equal(error.code, "ORDER_NOT_CANCELLABLE");
      return true;
    },
  );
});

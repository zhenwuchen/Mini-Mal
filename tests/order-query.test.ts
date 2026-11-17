import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient, type User } from "@prisma/client";

import {
  createOrderQueryService,
  OrderQueryError,
  type OrderQueryErrorCode,
} from "../src/lib/order-query-service";
import {
  buildOrderListOrderBy,
  buildOrderListWhere,
  getOrderItemImage,
  getOrderStatusFilterOptions,
  getOrderStatusPresentation,
  normalizeOrderListSearchParams,
  normalizeOrderPagination,
  ORDER_LIST_DEFAULT_PAGE_SIZE,
  ORDER_LIST_MAX_PAGE_SIZE,
} from "../src/lib/order-query-core";

const prisma = new PrismaClient();
const testPrefix = `phase06-5-query-${process.pid}-${Date.now()}`;
let fixtureSequence = 0;

function nextFixtureName(label: string) {
  fixtureSequence += 1;
  return `${testPrefix}-${fixtureSequence}-${label}`;
}

async function createUser(label: string): Promise<User> {
  const fixture = nextFixtureName(label);

  return prisma.user.create({
    data: {
      name: `Order Query Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "must-never-leave-the-database",
    },
  });
}

async function createProduct({
  label,
  name,
  imageUrl,
  price = 1_000,
}: {
  label: string;
  name?: string;
  imageUrl?: string | null;
  price?: number;
}) {
  const fixture = nextFixtureName(label);
  const category = await prisma.category.create({
    data: {
      name: `Order Query Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });

  return prisma.product.create({
    data: {
      name: name ?? `Order Product ${label}`,
      slug: `${fixture}-product`,
      price,
      stock: 20,
      imageUrl:
        imageUrl === undefined
          ? `/images/order/${fixture}.jpg`
          : imageUrl,
      categoryId: category.id,
    },
  });
}

async function createAddress({
  userId,
  label,
  recipientName = `收件人 ${label}`,
  city = "杭州市",
}: {
  userId: string;
  label: string;
  recipientName?: string;
  city?: string;
}) {
  return prisma.address.create({
    data: {
      userId,
      recipientName,
      phone: "13800138000",
      province: "浙江省",
      city,
      district: "西湖区",
      addressLine: `${label} 路 88 号`,
      postalCode: "310000",
      isDefault: true,
    },
  });
}

type OrderItemFixture = {
  productId?: string | null;
  productName: string;
  productSlug?: string | null;
  productImageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

async function createOrder({
  userId,
  label,
  status = "PENDING_PAYMENT",
  createdAt = new Date("2026-03-01T08:00:00.000Z"),
  items,
  shippingAddressId,
  shippingSnapshot,
}: {
  userId: string;
  label: string;
  status?: string;
  createdAt?: Date;
  items: OrderItemFixture[];
  shippingAddressId?: string;
  shippingSnapshot?: {
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    addressLine: string;
    postalCode?: string | null;
  };
}) {
  const fixture = nextFixtureName(label);
  const itemsAmount = items.reduce(
    (total, item) => total + item.subtotal,
    0,
  );
  const shippingAmount = 500;
  const discountAmount = 200;
  const snapshot = shippingSnapshot ?? {
    recipientName: "历史收件人",
    phone: "13900139000",
    province: "上海市",
    city: "上海市",
    district: "徐汇区",
    addressLine: "历史快照路 100 号",
    postalCode: "200000",
  };

  return prisma.order.create({
    data: {
      orderNumber: fixture,
      userId,
      checkoutKey: `${fixture}-checkout`,
      itemsAmount,
      shippingAmount,
      discountAmount,
      totalAmount: itemsAmount + shippingAmount - discountAmount,
      currency: "CNY",
      status,
      createdAt,
      shippingAddressId,
      shippingName: snapshot.recipientName,
      shippingPhone: snapshot.phone,
      shippingAddress: [
        snapshot.province,
        snapshot.city === snapshot.province ? "" : snapshot.city,
        snapshot.district,
        snapshot.addressLine,
      ].join(""),
      shippingRecipientName: snapshot.recipientName,
      shippingProvince: snapshot.province,
      shippingCity: snapshot.city,
      shippingDistrict: snapshot.district,
      shippingAddressLine: snapshot.addressLine,
      shippingPostalCode: snapshot.postalCode,
      items: {
        create: items,
      },
    },
  });
}

function serviceFor(userId: string | null) {
  return createOrderQueryService({
    prisma,
    getCurrentUserId: async () => userId,
  });
}

function assertOrderQueryError(
  error: unknown,
  code: OrderQueryErrorCode,
  expectedMessage?: string,
) {
  assert.ok(error instanceof OrderQueryError);
  assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /SQL|Prisma|stack|passwordHash/i);
  if (expectedMessage) {
    assert.equal(error.message, expectedMessage);
  }
}

function visitObjectKeys(
  value: unknown,
  visitor: (key: string) => void,
) {
  if (Array.isArray(value)) {
    for (const item of value) visitObjectKeys(item, visitor);
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      visitor(key);
      visitObjectKeys(nestedValue, visitor);
    }
  }
}

test.after(async () => {
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: testPrefix } },
  });
  await prisma.product.deleteMany({
    where: { slug: { startsWith: testPrefix } },
  });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: testPrefix } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: testPrefix } },
  });

  assert.equal(
    await prisma.order.count({
      where: { orderNumber: { startsWith: testPrefix } },
    }),
    0,
  );
  assert.equal(
    await prisma.user.count({
      where: { email: { startsWith: testPrefix } },
    }),
    0,
  );
  await prisma.$disconnect();
});

test("normalizes pagination and search filters safely", () => {
  assert.equal(ORDER_LIST_DEFAULT_PAGE_SIZE, 6);
  assert.equal(ORDER_LIST_MAX_PAGE_SIZE, 20);
  assert.deepEqual(
    normalizeOrderPagination({
      page: "2",
      pageSize: "999",
    }),
    { page: 2, pageSize: 20 },
  );
  assert.deepEqual(
    normalizeOrderPagination({
      page: "-1",
      pageSize: "1.5",
    }),
    { page: 1, pageSize: 6 },
  );
  assert.deepEqual(
    normalizeOrderListSearchParams({
      page: "0",
      pageSize: "0",
      status: "REFUNDED",
    }),
    { page: 1, pageSize: 6, status: "REFUNDED" },
  );
  assert.deepEqual(
    normalizeOrderListSearchParams({
      status: "NOT_A_STATUS",
    }),
    { page: 1, pageSize: 6, status: undefined },
  );
});

test("builds a stable user-scoped order query", () => {
  assert.deepEqual(buildOrderListWhere("user-a", "PAID"), {
    userId: "user-a",
    status: "PAID",
  });
  assert.deepEqual(buildOrderListWhere("user-a"), {
    userId: "user-a",
  });
  assert.deepEqual(buildOrderListOrderBy(), [
    { createdAt: "desc" },
    { orderNumber: "asc" },
  ]);
});

test("maps every supported status and safely falls back for unknown values", () => {
  assert.equal(getOrderStatusPresentation("PENDING_PAYMENT").label, "待付款");
  assert.equal(getOrderStatusPresentation("PAID").label, "已付款");
  assert.equal(getOrderStatusPresentation("PROCESSING").label, "处理中");
  assert.equal(getOrderStatusPresentation("SHIPPED").label, "已发货");
  assert.equal(getOrderStatusPresentation("COMPLETED").label, "已完成");
  assert.equal(getOrderStatusPresentation("CANCELLED").label, "已取消");
  assert.equal(getOrderStatusPresentation("REFUNDED").label, "已退款");
  assert.deepEqual(getOrderStatusPresentation("FUTURE_STATUS"), {
    label: "状态未知",
    tone: "neutral",
  });
  assert.equal(getOrderStatusFilterOptions().length, 8);
  assert.equal(
    getOrderItemImage("   "),
    "/images/categories/home-living.jpg",
  );
  assert.equal(
    getOrderItemImage(" /images/order/snapshot.jpg "),
    "/images/order/snapshot.jpg",
  );
});

test("rejects both order queries when no user is signed in", async () => {
  await assert.rejects(serviceFor(null).getOrders({}), (error) => {
    assertOrderQueryError(error, "UNAUTHENTICATED");
    return true;
  });
  await assert.rejects(
    serviceFor(null).getOrderDetail("any-order"),
    (error) => {
      assertOrderQueryError(error, "UNAUTHENTICATED");
      return true;
    },
  );
});

test("returns only the current user's orders with snapshot summaries", async () => {
  const userA = await createUser("list-a");
  const userB = await createUser("list-b");
  const productA = await createProduct({
    label: "list-a",
    name: "历史杯具",
  });
  const productB = await createProduct({
    label: "list-b",
    name: "另一位用户的商品",
  });
  const orderA = await createOrder({
    userId: userA.id,
    label: "list-a-order",
    items: [
      {
        productId: productA.id,
        productName: "历史杯具",
        productSlug: productA.slug,
        productImageUrl: "/images/order/history-cup.jpg",
        unitPrice: 1_250,
        quantity: 2,
        subtotal: 2_500,
      },
      {
        productId: productA.id,
        productName: "配套托盘",
        productSlug: null,
        productImageUrl: null,
        unitPrice: 500,
        quantity: 1,
        subtotal: 500,
      },
    ],
  });
  const orderB = await createOrder({
    userId: userB.id,
    label: "list-b-order",
    items: [
      {
        productId: productB.id,
        productName: "另一位用户的商品",
        productSlug: productB.slug,
        productImageUrl: null,
        unitPrice: 900,
        quantity: 1,
        subtotal: 900,
      },
    ],
  });

  const result = await serviceFor(userA.id).getOrders({});
  const otherResult = await serviceFor(userB.id).getOrders({});

  assert.equal(result.totalCount, 1);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].orderNumber, orderA.orderNumber);
  assert.equal(result.orders[0].totalQuantity, 3);
  assert.equal(result.orders[0].itemCount, 2);
  assert.equal(result.orders[0].items[0].productName, "历史杯具");
  assert.equal(result.orders[0].items[0].unitPrice, 1_250);
  assert.equal(result.orders[0].items[0].subtotal, 2_500);
  assert.equal(result.orders[0].totalAmount, 3_300);
  assert.equal(otherResult.totalCount, 1);
  assert.equal(
    otherResult.orders[0].orderNumber,
    orderB.orderNumber,
  );
  assert.equal(
    otherResult.orders.some(
      (order) => order.orderNumber === orderA.orderNumber,
    ),
    false,
  );

  const returnedKeys: string[] = [];
  visitObjectKeys(result, (key) => returnedKeys.push(key));
  assert.equal(returnedKeys.includes("userId"), false);
  assert.equal(returnedKeys.includes("passwordHash"), false);
  assert.equal(returnedKeys.includes("payments"), false);
});

test("sorts by creation time, breaks ties stably, and paginates correctly", async () => {
  const user = await createUser("pagination");

  await createOrder({
    userId: user.id,
    label: "c",
    createdAt: new Date("2026-04-03T08:00:00.000Z"),
    items: [],
  });
  await createOrder({
    userId: user.id,
    label: "b",
    createdAt: new Date("2026-04-02T08:00:00.000Z"),
    items: [],
  });
  const orderA = await createOrder({
    userId: user.id,
    label: "a",
    createdAt: new Date("2026-04-01T08:00:00.000Z"),
    items: [],
  });
  const sameTimeLow = await createOrder({
    userId: user.id,
    label: "same-low",
    createdAt: new Date("2026-04-01T08:00:00.000Z"),
    items: [],
  });
  const sameTimeHigh = await createOrder({
    userId: user.id,
    label: "same-high",
    createdAt: new Date("2026-04-01T08:00:00.000Z"),
    items: [],
  });

  const result = await serviceFor(user.id).getOrders({
    page: 2,
    pageSize: 2,
  });
  const expectedSameTime = [orderA, sameTimeLow, sameTimeHigh]
    .sort((left, right) =>
      left.orderNumber.localeCompare(right.orderNumber),
    )
    .map((order) => order.orderNumber);

  assert.equal(result.totalCount, 5);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 2);
  assert.equal(result.totalPages, 3);
  assert.deepEqual(
    result.orders.map((order) => order.orderNumber),
    [expectedSameTime[0], expectedSameTime[1]],
  );
});

test("filters by status and caps oversized previews while summing every item", async () => {
  const user = await createUser("filter");
  const product = await createProduct({ label: "filter" });
  const paidOrder = await createOrder({
    userId: user.id,
    label: "paid",
    status: "PAID",
    createdAt: new Date("2026-05-02T08:00:00.000Z"),
    items: Array.from({ length: 4 }, (_, index) => ({
      productId: product.id,
      productName: `快照商品 ${index + 1}`,
      productSlug: `${product.slug}-${index + 1}`,
      productImageUrl: `/images/order/${index + 1}.jpg`,
      unitPrice: 100,
      quantity: index + 1,
      subtotal: 100 * (index + 1),
    })),
  });
  await createOrder({
    userId: user.id,
    label: "cancelled",
    status: "CANCELLED",
    createdAt: new Date("2026-05-03T08:00:00.000Z"),
    items: [],
  });

  const result = await serviceFor(user.id).getOrders({
    status: "PAID",
  });

  assert.equal(result.totalCount, 1);
  assert.equal(result.orders[0].orderNumber, paidOrder.orderNumber);
  assert.equal(result.orders[0].items.length, 3);
  assert.equal(result.orders[0].itemCount, 4);
  assert.equal(result.orders[0].totalQuantity, 10);
});

test("preserves product and address snapshots after source records change or disappear", async () => {
  const user = await createUser("snapshots");
  const product = await createProduct({
    label: "snapshots",
    name: "下单时的商品名",
    imageUrl: "/images/order/original.jpg",
    price: 1_800,
  });
  const address = await createAddress({
    userId: user.id,
    label: "snapshots",
  });
  const order = await createOrder({
    userId: user.id,
    label: "snapshots-order",
    shippingAddressId: address.id,
    shippingSnapshot: {
      recipientName: "下单时的收件人",
      phone: "13700137000",
      province: "江苏省",
      city: "南京市",
      district: "鼓楼区",
      addressLine: "历史下单路 9 号",
      postalCode: "210000",
    },
    items: [
      {
        productId: product.id,
        productName: "下单时的商品名",
        productSlug: product.slug,
        productImageUrl: "/images/order/original.jpg",
        unitPrice: 1_800,
        quantity: 2,
        subtotal: 3_600,
      },
    ],
  });

  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: "修改后的商品名",
      slug: `${product.slug}-changed`,
      price: 9_900,
      imageUrl: "/images/order/changed.jpg",
    },
  });
  await prisma.address.update({
    where: { id: address.id },
    data: {
      recipientName: "修改后的收件人",
      city: "北京市",
      addressLine: "修改后的地址",
    },
  });

  let detail = await serviceFor(user.id).getOrderDetail(
    order.orderNumber,
  );
  assert.equal(detail.items[0].productName, "下单时的商品名");
  assert.equal(detail.items[0].unitPrice, 1_800);
  assert.equal(detail.items[0].productImageUrl, "/images/order/original.jpg");
  assert.equal(detail.shipping.recipientName, "下单时的收件人");
  assert.equal(detail.shipping.city, "南京市");
  assert.equal(detail.shipping.addressLine, "历史下单路 9 号");

  await prisma.product.delete({ where: { id: product.id } });
  await prisma.address.delete({ where: { id: address.id } });

  detail = await serviceFor(user.id).getOrderDetail(order.orderNumber);
  const list = await serviceFor(user.id).getOrders({});

  assert.equal(detail.items[0].productName, "下单时的商品名");
  assert.equal(detail.items[0].unitPrice, 1_800);
  assert.equal(detail.items[0].productImageUrl, "/images/order/original.jpg");
  assert.equal(detail.shipping.recipientName, "下单时的收件人");
  assert.equal(detail.shipping.phone, "13700137000");
  assert.equal(detail.shipping.province, "江苏省");
  assert.equal(detail.shipping.city, "南京市");
  assert.equal(detail.shipping.district, "鼓楼区");
  assert.equal(detail.shipping.addressLine, "历史下单路 9 号");
  assert.equal(detail.shipping.postalCode, "210000");
  assert.equal(list.orders[0].items[0].productName, "下单时的商品名");
  assert.equal(list.orders[0].items[0].productImageUrl, "/images/order/original.jpg");
});

test("returns the same not-found error for missing and foreign orders", async () => {
  const userA = await createUser("uniform-a");
  const userB = await createUser("uniform-b");
  const foreignOrder = await createOrder({
    userId: userB.id,
    label: "foreign",
    items: [],
  });
  let expectedMessage = "";

  await assert.rejects(
    serviceFor(userA.id).getOrderDetail("missing-order"),
    (error) => {
      assertOrderQueryError(error, "ORDER_NOT_FOUND");
      if (error instanceof OrderQueryError) {
        expectedMessage = error.message;
      }
      return true;
    },
  );

  await assert.rejects(
    serviceFor(userA.id).getOrderDetail(foreignOrder.orderNumber),
    (error) => {
      assertOrderQueryError(
        error,
        "ORDER_NOT_FOUND",
        expectedMessage,
      );
      return true;
    },
  );
  await assert.rejects(
    serviceFor(userA.id).getOrderDetail("../private/path"),
    (error) => {
      assertOrderQueryError(
        error,
        "ORDER_NOT_FOUND",
        expectedMessage,
      );
      return true;
    },
  );
});

test("returns unknown stored statuses without exposing payment data", async () => {
  const user = await createUser("unknown-status");
  const order = await createOrder({
    userId: user.id,
    label: "unknown-status-order",
    status: "FUTURE_STATUS",
    items: [],
  });
  await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: 300,
      status: "SUCCEEDED",
      method: "MOCK",
      provider: "internal-provider",
      providerPaymentId: nextFixtureName("provider-payment"),
      idempotencyKey: nextFixtureName("payment-key"),
      failureReason: "internal-only-field",
    },
  });

  const detail = await serviceFor(user.id).getOrderDetail(
    order.orderNumber,
  );
  const returnedKeys: string[] = [];
  visitObjectKeys(detail, (key) => returnedKeys.push(key));

  assert.equal(detail.status, "FUTURE_STATUS");
  assert.equal(getOrderStatusPresentation(detail.status).label, "状态未知");
  assert.equal(returnedKeys.includes("payment"), false);
  assert.equal(returnedKeys.includes("payments"), false);
  assert.equal(returnedKeys.includes("provider"), false);
  assert.equal(returnedKeys.includes("userId"), false);
});

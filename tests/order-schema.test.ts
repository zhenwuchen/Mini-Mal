import assert from "node:assert/strict";
import test from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const testPrefix = `phase06-2-schema-${process.pid}-${Date.now()}`;
let fixtureSequence = 0;

function nextFixtureName(label: string) {
  fixtureSequence += 1;
  return `${testPrefix}-${fixtureSequence}-${label}`;
}

async function createUser(label: string) {
  const fixture = nextFixtureName(label);

  return prisma.user.create({
    data: {
      name: `Order Schema Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-order-schema-tests",
    },
  });
}

async function createProduct(label: string, price = 2500) {
  const fixture = nextFixtureName(label);
  const category = await prisma.category.create({
    data: {
      name: `Order Schema Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });

  return prisma.product.create({
    data: {
      name: `Order Schema Product ${label}`,
      slug: `${fixture}-product`,
      price,
      stock: 10,
      imageUrl: `/images/catalog/${fixture}.jpg`,
      categoryId: category.id,
    },
  });
}

function createAddress(
  userId: string,
  label: string,
  isDefault = false,
) {
  return prisma.address.create({
    data: {
      userId,
      recipientName: `Recipient ${label}`,
      phone: "13800138000",
      province: "上海市",
      city: "上海市",
      district: "徐汇区",
      addressLine: `${label} 路 100 号`,
      postalCode: "200000",
      isDefault,
    },
  });
}

function createOrderData({
  userId,
  checkoutKey,
  shippingAddressId,
}: {
  userId: string;
  checkoutKey: string | null;
  shippingAddressId?: string;
}) {
  const orderNumber = nextFixtureName("order");

  return {
    orderNumber,
    userId,
    checkoutKey,
    itemsAmount: 2000,
    shippingAmount: 500,
    discountAmount: 0,
    totalAmount: 2500,
    currency: "CNY",
    shippingName: "Legacy Recipient",
    shippingPhone: "13800138000",
    shippingAddress: "上海市徐汇区测试路 100 号",
    shippingAddressId,
    shippingRecipientName: "Snapshot Recipient",
    shippingProvince: "上海市",
    shippingCity: "上海市",
    shippingDistrict: "徐汇区",
    shippingAddressLine: "测试路 100 号",
    shippingPostalCode: "200000",
  };
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
  await prisma.$disconnect();
});

test("a user can own multiple addresses and deleting the user cascades addresses", async () => {
  const user = await createUser("address-book");
  const first = await createAddress(user.id, "home", true);
  const second = await createAddress(user.id, "office");

  const savedUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { addresses: { orderBy: { createdAt: "asc" } } },
  });
  assert.equal(savedUser?.addresses.length, 2);
  assert.equal(savedUser?.addresses[0].recipientName, first.recipientName);
  assert.equal(savedUser?.addresses[1].recipientName, second.recipientName);

  await prisma.user.delete({ where: { id: user.id } });
  assert.equal(
    await prisma.address.count({ where: { userId: user.id } }),
    0,
  );
});

test("deleting an address preserves the order and its address snapshots", async () => {
  const user = await createUser("address-snapshot");
  const address = await createAddress(user.id, "snapshot", true);
  const orderData = createOrderData({
    userId: user.id,
    checkoutKey: nextFixtureName("checkout"),
    shippingAddressId: address.id,
  });
  const order = await prisma.order.create({ data: orderData });

  await prisma.address.delete({ where: { id: address.id } });

  const savedOrder = await prisma.order.findUnique({
    where: { id: order.id },
  });
  assert.ok(savedOrder);
  assert.equal(savedOrder.shippingAddressId, null);
  assert.equal(savedOrder.shippingRecipientName, "Snapshot Recipient");
  assert.equal(savedOrder.shippingProvince, "上海市");
  assert.equal(savedOrder.shippingCity, "上海市");
  assert.equal(savedOrder.shippingDistrict, "徐汇区");
  assert.equal(savedOrder.shippingAddressLine, "测试路 100 号");
  assert.equal(savedOrder.shippingPostalCode, "200000");
});

test("order items retain product snapshots after the product is deleted", async () => {
  const user = await createUser("product-snapshot");
  const product = await createProduct("product-snapshot");
  const orderData = createOrderData({
    userId: user.id,
    checkoutKey: nextFixtureName("checkout"),
  });
  const order = await prisma.order.create({
    data: {
      ...orderData,
      items: {
        create: {
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          productImageUrl: product.imageUrl,
          unitPrice: product.price,
          quantity: 1,
          subtotal: product.price,
        },
      },
    },
    include: { items: true },
  });
  const orderItemId = order.items[0].id;

  await prisma.product.delete({ where: { id: product.id } });

  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
  });
  assert.ok(item);
  assert.equal(item.productId, null);
  assert.equal(item.productName, product.name);
  assert.equal(item.productSlug, product.slug);
  assert.equal(item.productImageUrl, product.imageUrl);
  assert.equal(item.unitPrice, 2500);
  assert.equal(item.subtotal, 2500);
});

test("checkoutKey is unique only when both user and key are present", async () => {
  const userA = await createUser("checkout-a");
  const userB = await createUser("checkout-b");
  const checkoutKey = nextFixtureName("shared-checkout");
  const firstOrder = createOrderData({
    userId: userA.id,
    checkoutKey,
  });
  await prisma.order.create({ data: firstOrder });

  await assert.rejects(
    prisma.order.create({
      data: createOrderData({
        userId: userA.id,
        checkoutKey,
      }),
    }),
    (error) => {
      assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
      assert.equal(error.code, "P2002");
      return true;
    },
  );

  await prisma.order.create({
    data: createOrderData({
      userId: userB.id,
      checkoutKey,
    }),
  });
  await prisma.order.create({
    data: createOrderData({
      userId: userA.id,
      checkoutKey: null,
    }),
  });
  await prisma.order.create({
    data: createOrderData({
      userId: userA.id,
      checkoutKey: null,
    }),
  });
});

test("payment provider payment IDs are unique when both values are present", async () => {
  const user = await createUser("payment-unique");
  const firstOrder = await prisma.order.create({
    data: createOrderData({
      userId: user.id,
      checkoutKey: nextFixtureName("checkout"),
    }),
  });
  const secondOrder = await prisma.order.create({
    data: createOrderData({
      userId: user.id,
      checkoutKey: nextFixtureName("checkout"),
    }),
  });
  const providerPaymentId = nextFixtureName("provider-payment");

  await prisma.payment.create({
    data: {
      orderId: firstOrder.id,
      amount: 2500,
      status: "SUCCEEDED",
      method: "MOCK",
      provider: "mock-provider",
      providerPaymentId,
      idempotencyKey: nextFixtureName("payment-request"),
      currency: "CNY",
      paidAt: new Date(),
    },
  });

  await assert.rejects(
    prisma.payment.create({
      data: {
        orderId: secondOrder.id,
        amount: 2500,
        status: "SUCCEEDED",
        method: "MOCK",
        provider: "mock-provider",
        providerPaymentId,
        idempotencyKey: nextFixtureName("payment-request"),
        currency: "CNY",
        paidAt: new Date(),
      },
    }),
    (error) => {
      assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
      assert.equal(error.code, "P2002");
      return true;
    },
  );
});

test("all monetary fields remain Prisma Int fields", () => {
  const expectedFields: Record<string, string[]> = {
    Product: ["price"],
    Order: [
      "itemsAmount",
      "shippingAmount",
      "discountAmount",
      "totalAmount",
    ],
    OrderItem: ["unitPrice", "subtotal"],
    Payment: ["amount"],
  };
  const models = Prisma.dmmf.datamodel.models as unknown as Array<{
    name: string;
    fields: Array<{ name: string; type: string }>;
  }>;

  for (const [modelName, fieldNames] of Object.entries(expectedFields)) {
    const model:
      | {
          name: string;
          fields: Array<{ name: string; type: string }>;
        }
      | undefined = models.find(
      (candidate) => candidate.name === modelName,
    );
    assert.ok(model);

    for (const fieldName of fieldNames) {
      const fieldTypes: string[] = model.fields
        .filter((candidate) => candidate.name === fieldName)
        .map((candidate) => candidate.type);
      assert.equal(
        fieldTypes[0],
        "Int",
        `${modelName}.${fieldName} should be Int`,
      );
    }
  }
});

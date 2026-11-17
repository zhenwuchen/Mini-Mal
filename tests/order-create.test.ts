import assert from "node:assert/strict";
import test from "node:test";

import {
  type Prisma,
  type PrismaClient,
  type User,
} from "@prisma/client";

import {
  OrderError,
  createOrderService,
  type CreateOrderInput,
  type OrderErrorCode,
} from "../src/lib/order-service";
import { createIsolatedOrderCreateTestDatabase } from "./helpers/test-database";

const testDatabase = createIsolatedOrderCreateTestDatabase();
const prisma = testDatabase.prisma;
const testPrefix = `phase06-4-order-${process.pid}-${Date.now()}`;
const fixedNow = new Date("2026-09-01T08:30:00.000Z");
const expectedExpiresAt = new Date("2026-09-01T09:00:00.000Z");
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
      name: `Order Create Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-order-create-tests",
    },
  });
}

async function createProduct({
  label,
  price = 1_000,
  stock = 10,
  isActive = true,
}: {
  label: string;
  price?: number;
  stock?: number;
  isActive?: boolean;
}) {
  const fixture = nextFixtureName(label);
  const category = await prisma.category.create({
    data: {
      name: `Order Create Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });

  return prisma.product.create({
    data: {
      name: `Order Product ${label}`,
      slug: `${fixture}-product`,
      price,
      stock,
      isActive,
      imageUrl: `/images/order/${fixture}.jpg`,
      categoryId: category.id,
    },
  });
}

async function createAddress(userId: string, label: string) {
  return prisma.address.create({
    data: {
      userId,
      recipientName: `收件人 ${label}`,
      phone: "13800138000",
      province: "浙江省",
      city: "杭州市",
      district: "西湖区",
      addressLine: `${label} 路 88 号`,
      postalCode: "310000",
      isDefault: true,
    },
  });
}

async function createCart(
  userId: string,
  items: Array<{ productId: string; quantity: number }>,
) {
  const cart = await prisma.cart.create({ data: { userId } });

  if (items.length > 0) {
    await prisma.cartItem.createMany({
      data: items.map((item) => ({
        cartId: cart.id,
        productId: item.productId,
        quantity: item.quantity,
      })),
    });
  }

  return cart;
}

function serviceFor(
  userId: string | null,
  client = prisma,
  currentTime: () => Date = () => fixedNow,
) {
  return createOrderService({
    prisma: client,
    getCurrentUserId: async () => userId,
    now: currentTime,
  });
}

function orderInput(
  addressId: string,
  checkoutKey: string,
): CreateOrderInput {
  return { addressId, checkoutKey };
}

async function getStock(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { stock: true },
  });
  assert.ok(product);
  return product.stock;
}

async function getCartQuantities(userId: string) {
  return prisma.cartItem.findMany({
    where: { cart: { userId } },
    select: { productId: true, quantity: true },
    orderBy: { productId: "asc" },
  });
}

async function getOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });
}

function assertOrderError(
  error: unknown,
  code: OrderErrorCode,
) {
  assert.ok(error instanceof OrderError);
  assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /SQL|Prisma|stack|injected/i);
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
            (transaction) => operation(wrapTransaction(transaction)),
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

test("rejects order creation when no user is signed in", async () => {
  const user = await createUser("signed-out");
  const address = await createAddress(user.id, "signed-out");
  const product = await createProduct({ label: "signed-out" });
  await createCart(user.id, [
    { productId: product.id, quantity: 1 },
  ]);

  await assert.rejects(
    serviceFor(null).createOrder(
      orderInput(address.id, "signed-out-key"),
    ),
    (error) => {
      assertOrderError(error, "UNAUTHENTICATED");
      return true;
    },
  );
  assert.equal(await getStock(product.id), 10);
  assert.equal((await getCartQuantities(user.id)).length, 1);
  assert.equal((await getOrdersForUser(user.id)).length, 0);
});

test("rejects empty, oversized, and malformed checkout keys", async () => {
  const user = await createUser("checkout-validation");
  const address = await createAddress(user.id, "checkout-validation");
  const product = await createProduct({
    label: "checkout-validation",
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 1 },
  ]);
  const service = serviceFor(user.id);
  const invalidKeys: unknown[] = [
    "",
    "   ",
    "key with spaces",
    "key/with/slashes",
    "a".repeat(129),
    null,
  ];

  for (const checkoutKey of invalidKeys) {
    await assert.rejects(
      service.createOrder({
        addressId: address.id,
        checkoutKey,
      } as CreateOrderInput),
      (error) => {
        assertOrderError(error, "INVALID_CHECKOUT_KEY");
        return true;
      },
    );
  }

  assert.equal(await getStock(product.id), 10);
  assert.equal((await getOrdersForUser(user.id)).length, 0);
});

test("rejects an empty cart without changing stock", async () => {
  const user = await createUser("empty-cart");
  const address = await createAddress(user.id, "empty-cart");
  await createCart(user.id, []);

  await assert.rejects(
    serviceFor(user.id).createOrder(
      orderInput(address.id, "empty-cart-key"),
    ),
    (error) => {
      assertOrderError(error, "CART_EMPTY");
      return true;
    },
  );
  assert.equal((await getOrdersForUser(user.id)).length, 0);
});

test("creates an order from the current cart, address, and product data", async () => {
  const user = await createUser("success");
  const address = await createAddress(user.id, "success");
  const productA = await createProduct({
    label: "success-a",
    price: 1_200,
    stock: 5,
  });
  const productB = await createProduct({
    label: "success-b",
    price: 350,
    stock: 2,
  });
  await createCart(user.id, [
    { productId: productA.id, quantity: 2 },
    { productId: productB.id, quantity: 1 },
  ]);

  const order = await serviceFor(user.id).createOrder(
    orderInput(address.id, "success-key"),
  );

  assert.equal(order.status, "PENDING_PAYMENT");
  assert.equal(order.currency, "CNY");
  assert.equal(
    order.expiresAt?.toISOString(),
    expectedExpiresAt.toISOString(),
  );
  assert.equal(order.itemsAmount, 2_750);
  assert.equal(order.shippingAmount, 0);
  assert.equal(order.discountAmount, 0);
  assert.equal(order.totalAmount, 2_750);
  assert.equal(order.shippingAddressId, address.id);
  assert.equal(order.shippingRecipientName, "收件人 success");
  assert.equal(order.shippingPhone, "13800138000");
  assert.equal(order.shippingName, "收件人 success");
  assert.equal(order.shippingProvince, "浙江省");
  assert.equal(order.shippingCity, "杭州市");
  assert.equal(order.shippingDistrict, "西湖区");
  assert.equal(order.shippingAddressLine, "success 路 88 号");
  assert.equal(order.shippingPostalCode, "310000");
  assert.equal(
    order.shippingAddress,
    "浙江省杭州市西湖区success 路 88 号",
  );
  assert.equal(order.items.length, 2);

  const itemA = order.items.find(
    (item) => item.productId === productA.id,
  );
  const itemB = order.items.find(
    (item) => item.productId === productB.id,
  );
  assert.ok(itemA);
  assert.ok(itemB);
  assert.deepEqual(
    {
      productName: itemA.productName,
      productSlug: itemA.productSlug,
      productImageUrl: itemA.productImageUrl,
      unitPrice: itemA.unitPrice,
      quantity: itemA.quantity,
      subtotal: itemA.subtotal,
    },
    {
      productName: productA.name,
      productSlug: productA.slug,
      productImageUrl: productA.imageUrl,
      unitPrice: 1_200,
      quantity: 2,
      subtotal: 2_400,
    },
  );
  assert.equal(itemB.subtotal, 350);
  assert.equal(await getStock(productA.id), 3);
  assert.equal(await getStock(productB.id), 1);
  assert.deepEqual(await getCartQuantities(user.id), []);
});

test("sets the same server-controlled expiration on a single-item order", async () => {
  const user = await createUser("server-expiration");
  const address = await createAddress(user.id, "server-expiration");
  const product = await createProduct({
    label: "server-expiration",
    stock: 2,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 1 },
  ]);

  const order = await serviceFor(user.id).createOrder(
    orderInput(address.id, "server-expiration-key"),
  );
  const savedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
  });

  assert.equal(
    order.expiresAt?.toISOString(),
    expectedExpiresAt.toISOString(),
  );
  assert.equal(
    savedOrder.expiresAt?.toISOString(),
    expectedExpiresAt.toISOString(),
  );
});

test("ignores a client-supplied order expiration", async () => {
  const user = await createUser("forged-expiration");
  const address = await createAddress(user.id, "forged-expiration");
  const product = await createProduct({
    label: "forged-expiration",
    stock: 2,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 1 },
  ]);

  const order = await serviceFor(user.id).createOrder({
    addressId: address.id,
    checkoutKey: "forged-expiration-key",
    expiresAt: new Date("2035-01-01T00:00:00.000Z"),
    timeout: 999_999,
  } as CreateOrderInput);

  assert.equal(
    order.expiresAt?.toISOString(),
    expectedExpiresAt.toISOString(),
  );
});

test("ignores client-supplied identity, cart, price, and total fields", async () => {
  const user = await createUser("ignore-fields");
  const otherUser = await createUser("ignore-fields-other");
  const address = await createAddress(user.id, "ignore-fields");
  const product = await createProduct({
    label: "ignore-fields",
    price: 990,
    stock: 3,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 2 },
  ]);

  const order = await serviceFor(user.id).createOrder({
    addressId: address.id,
    checkoutKey: "ignore-fields-key",
    userId: otherUser.id,
    cartId: "forged-cart",
    productName: "伪造商品",
    unitPrice: 1,
    subtotal: 1,
    totalAmount: 1,
    stock: 999,
    shippingAddress: "伪造地址",
  } as CreateOrderInput);

  const savedOrder = await prisma.order.findUnique({
    where: { id: order.id },
  });
  assert.equal(savedOrder?.userId, user.id);
  assert.equal(order.totalAmount, 1_980);
  assert.equal(order.items[0].productName, product.name);
  assert.equal(order.items[0].unitPrice, 990);
  assert.equal(order.shippingAddressLine, "ignore-fields 路 88 号");
});

test("clears only the signed-in user's cart", async () => {
  const userA = await createUser("cart-isolation-a");
  const userB = await createUser("cart-isolation-b");
  const addressA = await createAddress(userA.id, "cart-isolation-a");
  const product = await createProduct({
    label: "cart-isolation",
    stock: 5,
  });
  await createCart(userA.id, [
    { productId: product.id, quantity: 1 },
  ]);
  await createCart(userB.id, [
    { productId: product.id, quantity: 2 },
  ]);

  await serviceFor(userA.id).createOrder(
    orderInput(addressA.id, "cart-isolation-key"),
  );

  assert.deepEqual(await getCartQuantities(userA.id), []);
  assert.deepEqual(await getCartQuantities(userB.id), [
    { productId: product.id, quantity: 2 },
  ]);
  assert.equal(await getStock(product.id), 4);
});

test("rejects another user's address and keeps stock and cart intact", async () => {
  const userA = await createUser("foreign-address-a");
  const userB = await createUser("foreign-address-b");
  const addressB = await createAddress(userB.id, "foreign-address-b");
  const product = await createProduct({
    label: "foreign-address",
    stock: 4,
  });
  await createCart(userA.id, [
    { productId: product.id, quantity: 2 },
  ]);

  await assert.rejects(
    serviceFor(userA.id).createOrder(
      orderInput(addressB.id, "foreign-address-key"),
    ),
    (error) => {
      assertOrderError(error, "ADDRESS_INVALID");
      return true;
    },
  );
  assert.equal(await getStock(product.id), 4);
  assert.deepEqual(await getCartQuantities(userA.id), [
    { productId: product.id, quantity: 2 },
  ]);
  assert.equal((await getOrdersForUser(userA.id)).length, 0);
});

test("rejects a missing address with the same address error", async () => {
  const user = await createUser("missing-address");
  const product = await createProduct({ label: "missing-address" });
  await createCart(user.id, [
    { productId: product.id, quantity: 1 },
  ]);

  await assert.rejects(
    serviceFor(user.id).createOrder(
      orderInput("missing-address-id", "missing-address-key"),
    ),
    (error) => {
      assertOrderError(error, "ADDRESS_INVALID");
      return true;
    },
  );
  assert.equal(await getStock(product.id), 10);
});

test("rejects an inactive product without changing the cart", async () => {
  const user = await createUser("inactive");
  const address = await createAddress(user.id, "inactive");
  const product = await createProduct({
    label: "inactive",
    stock: 5,
    isActive: false,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 1 },
  ]);

  await assert.rejects(
    serviceFor(user.id).createOrder(
      orderInput(address.id, "inactive-key"),
    ),
    (error) => {
      assertOrderError(error, "PRODUCT_INACTIVE");
      return true;
    },
  );
  assert.equal(await getStock(product.id), 5);
  assert.equal((await getCartQuantities(user.id)).length, 1);
});

test("rejects a missing product and preserves all cart data", async () => {
  const user = await createUser("missing-product");
  const address = await createAddress(user.id, "missing-product");
  const product = await createProduct({ label: "missing-product" });
  await createCart(user.id, [
    { productId: product.id, quantity: 1 },
  ]);
  const client = createInterceptedPrisma(
    ({ model, action }) =>
      model === "product" && action === "findMany" ? [] : undefined,
  );

  await assert.rejects(
    serviceFor(user.id, client).createOrder(
      orderInput(address.id, "missing-product-key"),
    ),
    (error) => {
      assertOrderError(error, "PRODUCT_NOT_FOUND");
      return true;
    },
  );
  assert.equal((await getCartQuantities(user.id)).length, 1);
  assert.equal((await getOrdersForUser(user.id)).length, 0);
});

test("rejects invalid cart quantities and invalid product prices", async () => {
  const quantityUser = await createUser("invalid-quantity");
  const quantityAddress = await createAddress(
    quantityUser.id,
    "invalid-quantity",
  );
  const quantityProduct = await createProduct({
    label: "invalid-quantity",
  });
  await createCart(quantityUser.id, [
    { productId: quantityProduct.id, quantity: 0 },
  ]);

  await assert.rejects(
    serviceFor(quantityUser.id).createOrder(
      orderInput(
        quantityAddress.id,
        "invalid-quantity-key",
      ),
    ),
    (error) => {
      assertOrderError(error, "INVALID_CART_ITEM");
      return true;
    },
  );

  const priceUser = await createUser("invalid-price");
  const priceAddress = await createAddress(priceUser.id, "invalid-price");
  const priceProduct = await createProduct({
    label: "invalid-price",
    price: -1,
  });
  await createCart(priceUser.id, [
    { productId: priceProduct.id, quantity: 1 },
  ]);

  await assert.rejects(
    serviceFor(priceUser.id).createOrder(
      orderInput(priceAddress.id, "invalid-price-key"),
    ),
    (error) => {
      assertOrderError(error, "INVALID_PRODUCT_PRICE");
      return true;
    },
  );
  assert.equal(await getStock(quantityProduct.id), 10);
  assert.equal(await getStock(priceProduct.id), 10);
});

test("rejects insufficient stock without creating an order", async () => {
  const user = await createUser("insufficient");
  const address = await createAddress(user.id, "insufficient");
  const product = await createProduct({
    label: "insufficient",
    stock: 1,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 2 },
  ]);

  await assert.rejects(
    serviceFor(user.id).createOrder(
      orderInput(address.id, "insufficient-key"),
    ),
    (error) => {
      assertOrderError(error, "INSUFFICIENT_STOCK");
      return true;
    },
  );
  assert.equal(await getStock(product.id), 1);
  assert.deepEqual(await getCartQuantities(user.id), [
    { productId: product.id, quantity: 2 },
  ]);
  assert.equal((await getOrdersForUser(user.id)).length, 0);
});

test("allows buying exactly the remaining stock", async () => {
  const user = await createUser("exact-stock");
  const address = await createAddress(user.id, "exact-stock");
  const product = await createProduct({
    label: "exact-stock",
    stock: 3,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 3 },
  ]);

  const order = await serviceFor(user.id).createOrder(
    orderInput(address.id, "exact-stock-key"),
  );

  assert.equal(order.items[0].quantity, 3);
  assert.equal(await getStock(product.id), 0);
});

test("rolls back earlier stock updates when one product is unavailable", async () => {
  const user = await createUser("multi-failure");
  const address = await createAddress(user.id, "multi-failure");
  const available = await createProduct({
    label: "multi-failure-available",
    stock: 5,
  });
  const insufficient = await createProduct({
    label: "multi-failure-insufficient",
    stock: 1,
  });
  await createCart(user.id, [
    { productId: available.id, quantity: 2 },
    { productId: insufficient.id, quantity: 2 },
  ]);

  await assert.rejects(
    serviceFor(user.id).createOrder(
      orderInput(address.id, "multi-failure-key"),
    ),
    (error) => {
      assertOrderError(error, "INSUFFICIENT_STOCK");
      return true;
    },
  );
  assert.equal(await getStock(available.id), 5);
  assert.equal(await getStock(insufficient.id), 1);
  assert.equal((await getCartQuantities(user.id)).length, 2);
  assert.equal((await getOrdersForUser(user.id)).length, 0);
});

test("returns the original order for a repeated checkout key", async () => {
  const user = await createUser("idempotent");
  const address = await createAddress(user.id, "idempotent");
  const product = await createProduct({
    label: "idempotent",
    price: 500,
    stock: 5,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 2 },
  ]);
  let currentTime = fixedNow;
  const service = serviceFor(
    user.id,
    prisma,
    () => currentTime,
  );
  const input = orderInput(address.id, "idempotent-key");

  const first = await service.createOrder(input);
  assert.equal(
    first.expiresAt?.toISOString(),
    expectedExpiresAt.toISOString(),
  );
  currentTime = new Date("2026-09-01T08:50:00.000Z");
  await prisma.product.update({
    where: { id: product.id },
    data: { price: 900, name: "Changed Product" },
  });
  await prisma.cartItem.create({
    data: {
      cart: { connect: { userId: user.id } },
      product: { connect: { id: product.id } },
      quantity: 1,
    },
  });
  const repeated = await service.createOrder(input);

  assert.equal(repeated.id, first.id);
  assert.equal(
    repeated.expiresAt?.toISOString(),
    first.expiresAt?.toISOString(),
  );
  assert.equal(repeated.totalAmount, 1_000);
  assert.equal(repeated.items[0].unitPrice, 500);
  assert.equal(await getStock(product.id), 3);
  assert.equal((await getOrdersForUser(user.id)).length, 1);
  assert.deepEqual(await getCartQuantities(user.id), [
    { productId: product.id, quantity: 1 },
  ]);
});

test("allows different users to use the same checkout key", async () => {
  const userA = await createUser("shared-key-a");
  const userB = await createUser("shared-key-b");
  const addressA = await createAddress(userA.id, "shared-key-a");
  const addressB = await createAddress(userB.id, "shared-key-b");
  const productA = await createProduct({
    label: "shared-key-a",
    stock: 2,
  });
  const productB = await createProduct({
    label: "shared-key-b",
    stock: 2,
  });
  await createCart(userA.id, [
    { productId: productA.id, quantity: 1 },
  ]);
  await createCart(userB.id, [
    { productId: productB.id, quantity: 1 },
  ]);

  const [orderA, orderB] = await Promise.all([
    serviceFor(userA.id).createOrder(
      orderInput(addressA.id, "shared-checkout-key"),
    ),
    serviceFor(userB.id).createOrder(
      orderInput(addressB.id, "shared-checkout-key"),
    ),
  ]);

  assert.notEqual(orderA.id, orderB.id);
  assert.equal(await getStock(productA.id), 1);
  assert.equal(await getStock(productB.id), 1);
});

test("concurrent submissions with the same key create one order", async () => {
  const user = await createUser("concurrent-key");
  const address = await createAddress(user.id, "concurrent-key");
  const product = await createProduct({
    label: "concurrent-key",
    stock: 5,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 2 },
  ]);
  const service = serviceFor(user.id);
  const input = orderInput(address.id, "concurrent-key-value");

  const results = await Promise.all([
    service.createOrder(input),
    service.createOrder(input),
  ]);

  assert.equal(results[0].id, results[1].id);
  assert.equal(await getStock(product.id), 3);
  assert.equal((await getOrdersForUser(user.id)).length, 1);
  assert.equal(
    await prisma.orderItem.count({
      where: { orderId: results[0].id },
    }),
    1,
  );
  assert.deepEqual(await getCartQuantities(user.id), []);
});

test("two users cannot buy the same final unit", async () => {
  const userA = await createUser("last-unit-a");
  const userB = await createUser("last-unit-b");
  const addressA = await createAddress(userA.id, "last-unit-a");
  const addressB = await createAddress(userB.id, "last-unit-b");
  const product = await createProduct({
    label: "last-unit",
    stock: 1,
  });
  await createCart(userA.id, [
    { productId: product.id, quantity: 1 },
  ]);
  await createCart(userB.id, [
    { productId: product.id, quantity: 1 },
  ]);

  const results = await Promise.allSettled([
    serviceFor(userA.id).createOrder(
      orderInput(addressA.id, "last-unit-a-key"),
    ),
    serviceFor(userB.id).createOrder(
      orderInput(addressB.id, "last-unit-b-key"),
    ),
  ]);
  const successes = results.filter(
    (result) => result.status === "fulfilled",
  );
  const failures = results.filter(
    (result) => result.status === "rejected",
  );

  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.equal(await getStock(product.id), 0);
  assert.equal(
    await prisma.order.count({
      where: { userId: { in: [userA.id, userB.id] } },
    }),
    1,
  );

  const failedUser =
    results[0].status === "rejected" ? userA : userB;
  assert.equal((await getCartQuantities(failedUser.id)).length, 1);
  assert.equal((await getOrdersForUser(failedUser.id)).length, 0);
});

test("concurrent multi-unit purchases never oversell", async () => {
  const userA = await createUser("multi-concurrent-a");
  const userB = await createUser("multi-concurrent-b");
  const addressA = await createAddress(userA.id, "multi-concurrent-a");
  const addressB = await createAddress(userB.id, "multi-concurrent-b");
  const product = await createProduct({
    label: "multi-concurrent",
    stock: 3,
  });
  await createCart(userA.id, [
    { productId: product.id, quantity: 2 },
  ]);
  await createCart(userB.id, [
    { productId: product.id, quantity: 2 },
  ]);

  const results = await Promise.allSettled([
    serviceFor(userA.id).createOrder(
      orderInput(addressA.id, "multi-concurrent-a-key"),
    ),
    serviceFor(userB.id).createOrder(
      orderInput(addressB.id, "multi-concurrent-b-key"),
    ),
  ]);

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(await getStock(product.id), 1);
  assert.equal(await prisma.order.count({
    where: { userId: { in: [userA.id, userB.id] } },
  }), 1);
});

test("rolls back stock when order creation fails", async () => {
  const user = await createUser("fail-order");
  const address = await createAddress(user.id, "fail-order");
  const product = await createProduct({
    label: "fail-order",
    stock: 4,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 2 },
  ]);
  const client = createInterceptedPrisma(({ model, action }) => {
    if (model === "order" && action === "create") {
      throw new Error("injected order failure");
    }
    return undefined;
  });

  await assert.rejects(
    serviceFor(user.id, client).createOrder(
      orderInput(address.id, "fail-order-key"),
    ),
    (error) => {
      assertOrderError(error, "ORDER_CREATE_FAILED");
      return true;
    },
  );
  assert.equal(await getStock(product.id), 4);
  assert.equal((await getCartQuantities(user.id)).length, 1);
  assert.equal((await getOrdersForUser(user.id)).length, 0);
});

test("rolls back order and stock when order item creation fails", async () => {
  const user = await createUser("fail-order-item");
  const address = await createAddress(user.id, "fail-order-item");
  const product = await createProduct({
    label: "fail-order-item",
    stock: 4,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 2 },
  ]);
  const client = createInterceptedPrisma(({ model, action }) => {
    if (model === "orderItem" && action === "createMany") {
      throw new Error("injected order item failure");
    }
    return undefined;
  });

  await assert.rejects(
    serviceFor(user.id, client).createOrder(
      orderInput(address.id, "fail-order-item-key"),
    ),
    (error) => {
      assertOrderError(error, "ORDER_CREATE_FAILED");
      return true;
    },
  );
  assert.equal(await getStock(product.id), 4);
  assert.equal((await getCartQuantities(user.id)).length, 1);
  assert.equal((await getOrdersForUser(user.id)).length, 0);
});

test("rolls back order, items, and stock when cart clearing fails", async () => {
  const user = await createUser("fail-clear");
  const address = await createAddress(user.id, "fail-clear");
  const product = await createProduct({
    label: "fail-clear",
    stock: 4,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 2 },
  ]);
  const client = createInterceptedPrisma(({ model, action }) => {
    if (model === "cartItem" && action === "deleteMany") {
      throw new Error("injected cart clear failure");
    }
    return undefined;
  });

  await assert.rejects(
    serviceFor(user.id, client).createOrder(
      orderInput(address.id, "fail-clear-key"),
    ),
    (error) => {
      assertOrderError(error, "ORDER_CREATE_FAILED");
      return true;
    },
  );
  assert.equal(await getStock(product.id), 4);
  assert.equal((await getCartQuantities(user.id)).length, 1);
  assert.equal((await getOrdersForUser(user.id)).length, 0);
  assert.equal(
    await prisma.orderItem.count({
      where: { order: { userId: user.id } },
    }),
    0,
  );
});

test("an order snapshot remains unchanged after product and address changes", async () => {
  const user = await createUser("snapshot");
  const address = await createAddress(user.id, "snapshot");
  const product = await createProduct({
    label: "snapshot",
    price: 2_500,
    stock: 2,
  });
  await createCart(user.id, [
    { productId: product.id, quantity: 1 },
  ]);
  const order = await serviceFor(user.id).createOrder(
    orderInput(address.id, "snapshot-key"),
  );

  await prisma.product.update({
    where: { id: product.id },
    data: {
      name: "Renamed Product",
      price: 9_999,
      imageUrl: "/images/changed.jpg",
    },
  });
  await prisma.address.delete({ where: { id: address.id } });

  const savedOrder = await prisma.order.findUnique({
    where: { id: order.id },
    include: { items: true },
  });
  assert.ok(savedOrder);
  assert.equal(savedOrder.shippingAddressId, null);
  assert.equal(savedOrder.shippingRecipientName, "收件人 snapshot");
  assert.equal(savedOrder.itemsAmount, 2_500);
  assert.equal(savedOrder.items[0].productName, product.name);
  assert.equal(savedOrder.items[0].productImageUrl, product.imageUrl);
  assert.equal(savedOrder.items[0].unitPrice, 2_500);
});

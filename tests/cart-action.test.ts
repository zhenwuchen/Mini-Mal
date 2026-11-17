import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  buildProductLoginHref,
  executeAddToCart,
} from "../src/lib/cart-action";
import { createCartService } from "../src/lib/cart-service";

const prisma = new PrismaClient();
const testPrefix = `phase05-3-cart-action-${process.pid}-${Date.now()}`;
let fixtureSequence = 0;

type ProductFixture = {
  id: string;
};

function nextFixtureName(label: string) {
  fixtureSequence += 1;
  return `${testPrefix}-${fixtureSequence}-${label}`;
}

async function createUser(label: string) {
  const fixture = nextFixtureName(label);

  return prisma.user.create({
    data: {
      name: `Cart Action Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-cart-action-tests",
    },
  });
}

async function createProduct({
  label,
  stock,
  isActive = true,
}: {
  label: string;
  stock: number;
  isActive?: boolean;
}): Promise<ProductFixture> {
  const fixture = nextFixtureName(label);
  const category = await prisma.category.create({
    data: {
      name: `Cart Action Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: `Cart Action Product ${label}`,
      slug: `${fixture}-product`,
      price: 1299,
      stock,
      isActive,
      categoryId: category.id,
    },
  });

  return { id: product.id };
}

function addCartItemFor(userId: string | null) {
  return createCartService({
    prisma,
    getCurrentUserId: async () => userId,
  }).addCartItem;
}

function cartForm(productId: string, quantity: string | number) {
  const formData = new FormData();
  formData.set("productId", productId);
  formData.set("quantity", String(quantity));
  return formData;
}

test.after(async () => {
  await prisma.user.deleteMany({
    where: { email: { startsWith: testPrefix } },
  });
  await prisma.product.deleteMany({
    where: { slug: { startsWith: testPrefix } },
  });
  await prisma.category.deleteMany({
    where: { slug: { startsWith: testPrefix } },
  });
  await prisma.$disconnect();
});

test("adds to the signed-in user's cart and persists the quantity", async () => {
  const user = await createUser("success");
  const product = await createProduct({
    label: "success",
    stock: 5,
  });

  const state = await executeAddToCart(
    cartForm(product.id, 2),
    addCartItemFor(user.id),
  );

  assert.equal(state.status, "success");
  assert.equal(state.submittedQuantity, 2);
  assert.equal(state.totalQuantity, 2);

  const cartItem = await prisma.cartItem.findFirst({
    where: {
      cart: { userId: user.id },
      productId: product.id,
    },
  });
  assert.equal(cartItem?.quantity, 2);
});

test("a repeated action accumulates the existing cart quantity", async () => {
  const user = await createUser("repeat");
  const product = await createProduct({
    label: "repeat",
    stock: 5,
  });
  const addCartItem = addCartItemFor(user.id);

  await executeAddToCart(cartForm(product.id, 1), addCartItem);
  const state = await executeAddToCart(
    cartForm(product.id, 2),
    addCartItem,
  );

  assert.equal(state.status, "success");
  assert.equal(state.totalQuantity, 3);

  const cartItem = await prisma.cartItem.findFirst({
    where: {
      cart: { userId: user.id },
      productId: product.id,
    },
  });
  assert.equal(cartItem?.quantity, 3);
});

test("returns an authentication state without creating a cart", async () => {
  const product = await createProduct({
    label: "signed-out",
    stock: 5,
  });

  const state = await executeAddToCart(
    cartForm(product.id, 1),
    addCartItemFor(null),
  );

  assert.equal(state.status, "unauthenticated");
  assert.match(state.message ?? "", /登录/);
  assert.equal(
    await prisma.cartItem.count({ where: { productId: product.id } }),
    0,
  );
});

test("rejects an illegal product ID before calling the cart service", async () => {
  const state = await executeAddToCart(
    cartForm("../not-a-product-id", 1),
    async () => {
      throw new Error("cart service should not be called");
    },
  );

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /商品信息无效/);
});

test("rejects invalid quantities before calling the cart service", async () => {
  for (const quantity of ["0", "-1", "1.5", "not-a-number", ""]) {
    const state = await executeAddToCart(
      cartForm("valid-product-id", quantity),
      async () => {
        throw new Error("cart service should not be called");
      },
    );

    assert.equal(state.status, "error");
    assert.match(state.message ?? "", /数量/);
  }
});

test("maps an overstock cart error to a friendly message", async () => {
  const user = await createUser("overstock");
  const product = await createProduct({
    label: "overstock",
    stock: 2,
  });

  const state = await executeAddToCart(
    cartForm(product.id, 3),
    addCartItemFor(user.id),
  );

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /库存不足/);
});

test("maps an inactive product to a friendly message", async () => {
  const user = await createUser("inactive");
  const product = await createProduct({
    label: "inactive",
    stock: 5,
    isActive: false,
  });

  const state = await executeAddToCart(
    cartForm(product.id, 1),
    addCartItemFor(user.id),
  );

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /下架/);
});

test("maps an out-of-stock product to a friendly message", async () => {
  const user = await createUser("out-of-stock");
  const product = await createProduct({
    label: "out-of-stock",
    stock: 0,
  });

  const state = await executeAddToCart(
    cartForm(product.id, 1),
    addCartItemFor(user.id),
  );

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /缺货/);
});

test("maps an unexpected server error without exposing internals", async () => {
  const state = await executeAddToCart(
    cartForm("valid-product-id", 1),
    async () => {
      throw new Error(
        "database secret=do-not-expose at internal/cart-service.ts:42",
      );
    },
  );

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /稍后重试/);
  assert.doesNotMatch(state.message ?? "", /database secret|cart-service\.ts/);
});

test("builds a login URL that returns to the current product page", () => {
  assert.equal(
    buildProductLoginHref("ceramic-coffee-cup"),
    "/login?returnTo=%2Fproducts%2Fceramic-coffee-cup",
  );
});

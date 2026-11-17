import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  executeRemoveCartItem,
  executeUpdateCartItemQuantity,
} from "../src/lib/cart-line-action";
import {
  canDecreaseCartQuantity,
  canIncreaseCartQuantity,
  cartFallbackImage,
  cartLoginHref,
  getCartItemAvailability,
  getCartItemImage,
} from "../src/lib/cart-page";
import { createCartService } from "../src/lib/cart-service";

const prisma = new PrismaClient();
const testPrefix = `phase05-4-cart-page-${process.pid}-${Date.now()}`;
let fixtureSequence = 0;

function nextFixtureName(label: string) {
  fixtureSequence += 1;
  return `${testPrefix}-${fixtureSequence}-${label}`;
}

async function createUser(label: string) {
  const fixture = nextFixtureName(label);

  return prisma.user.create({
    data: {
      name: `Cart Page Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-cart-page-tests",
    },
  });
}

async function createProduct({
  label,
  price = 1999,
  stock = 5,
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
      name: `Cart Page Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });

  return prisma.product.create({
    data: {
      name: `Cart Page Product ${label}`,
      slug: `${fixture}-product`,
      price,
      stock,
      isActive,
      categoryId: category.id,
    },
  });
}

function serviceFor(userId: string | null) {
  return createCartService({
    prisma,
    getCurrentUserId: async () => userId,
  });
}

function updateForm(cartItemId: string, quantity: string | number) {
  const formData = new FormData();
  formData.set("cartItemId", cartItemId);
  formData.set("quantity", String(quantity));
  return formData;
}

function removeForm(cartItemId: string) {
  const formData = new FormData();
  formData.set("cartItemId", cartItemId);
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

test("uses a fallback image only when the cart image is missing", () => {
  assert.equal(getCartItemImage(null), cartFallbackImage);
  assert.equal(getCartItemImage("   "), cartFallbackImage);
  assert.equal(
    getCartItemImage("/images/catalog/cart-item.jpg"),
    "/images/catalog/cart-item.jpg",
  );
});

test("identifies inactive and out-of-stock cart products", () => {
  assert.equal(
    getCartItemAvailability({ isActive: false, stock: 5 }),
    "inactive",
  );
  assert.equal(
    getCartItemAvailability({ isActive: true, stock: 0 }),
    "out-of-stock",
  );
  assert.equal(
    getCartItemAvailability({ isActive: true, stock: 2 }),
    "available",
  );
});

test("limits quantity controls to valid positive quantities within stock", () => {
  assert.equal(canDecreaseCartQuantity({ quantity: 1, stock: 5 }), false);
  assert.equal(canDecreaseCartQuantity({ quantity: 2, stock: 1 }), true);
  assert.equal(
    canIncreaseCartQuantity({ quantity: 2, stock: 3, isActive: true }),
    true,
  );
  assert.equal(
    canIncreaseCartQuantity({ quantity: 3, stock: 3, isActive: true }),
    false,
  );
  assert.equal(
    canIncreaseCartQuantity({ quantity: 1, stock: 3, isActive: false }),
    false,
  );
});

test("updates the quantity and returns the server-calculated cart", async () => {
  const user = await createUser("update");
  const product = await createProduct({ label: "update", price: 1250 });
  const service = serviceFor(user.id);
  const cart = await service.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  const state = await executeUpdateCartItemQuantity(
    updateForm(cart.items[0].id, 3),
    service.updateCartItemQuantity,
  );

  assert.equal(state.status, "success");
  assert.equal(state.quantity, 3);

  const savedItem = await prisma.cartItem.findUnique({
    where: { id: cart.items[0].id },
  });
  assert.equal(savedItem?.quantity, 3);
});

test("decreases quantity without deleting the cart item", async () => {
  const user = await createUser("decrease");
  const product = await createProduct({ label: "decrease" });
  const service = serviceFor(user.id);
  const cart = await service.addCartItem({
    productId: product.id,
    quantity: 3,
  });

  const state = await executeUpdateCartItemQuantity(
    updateForm(cart.items[0].id, 1),
    service.updateCartItemQuantity,
  );

  assert.equal(state.status, "success");
  const savedItem = await prisma.cartItem.findUnique({
    where: { id: cart.items[0].id },
  });
  assert.equal(savedItem?.quantity, 1);
});

test("rejects a quantity above live stock without changing the item", async () => {
  const user = await createUser("overstock");
  const product = await createProduct({
    label: "overstock",
    stock: 2,
  });
  const service = serviceFor(user.id);
  const cart = await service.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  const state = await executeUpdateCartItemQuantity(
    updateForm(cart.items[0].id, 3),
    service.updateCartItemQuantity,
  );

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /库存不足/);
  const savedItem = await prisma.cartItem.findUnique({
    where: { id: cart.items[0].id },
  });
  assert.equal(savedItem?.quantity, 2);
});

test("rejects an invalid cart item ID or quantity", async () => {
  const invalidId = await executeUpdateCartItemQuantity(
    updateForm("not a valid id", 2),
    async () => {
      throw new Error("cart service should not be called");
    },
  );
  const invalidQuantity = await executeUpdateCartItemQuantity(
    updateForm("valid-cart-item-id", "1.5"),
    async () => {
      throw new Error("cart service should not be called");
    },
  );

  assert.equal(invalidId.status, "error");
  assert.equal(invalidQuantity.status, "error");
});

test("removes an owned cart item through the server action handler", async () => {
  const user = await createUser("remove");
  const product = await createProduct({ label: "remove" });
  const service = serviceFor(user.id);
  const cart = await service.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  const state = await executeRemoveCartItem(
    removeForm(cart.items[0].id),
    service.removeCartItem,
  );

  assert.equal(state.status, "success");
  assert.equal(
    await prisma.cartItem.count({ where: { id: cart.items[0].id } }),
    0,
  );
});

test("returns authentication feedback when the cart session is missing", async () => {
  const product = await createProduct({ label: "signed-out" });
  const user = await createUser("signed-out-owner");
  const ownerService = serviceFor(user.id);
  const cart = await ownerService.addCartItem({
    productId: product.id,
    quantity: 1,
  });
  const signedOutService = serviceFor(null);

  const updateState = await executeUpdateCartItemQuantity(
    updateForm(cart.items[0].id, 2),
    signedOutService.updateCartItemQuantity,
  );
  const removeState = await executeRemoveCartItem(
    removeForm(cart.items[0].id),
    signedOutService.removeCartItem,
  );

  assert.equal(updateState.status, "unauthenticated");
  assert.equal(removeState.status, "unauthenticated");
  assert.equal(cartLoginHref, "/login?returnTo=%2Fcart");
  assert.equal(
    await prisma.cartItem.count({ where: { id: cart.items[0].id } }),
    1,
  );
});

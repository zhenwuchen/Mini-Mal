import assert from "node:assert/strict";
import test from "node:test";

import { createIsolatedStorefrontTestDatabase } from "./helpers/test-database";
import { executeAddToCart } from "../src/lib/cart-action";
import { createCartService } from "../src/lib/cart-service";

const database = createIsolatedStorefrontTestDatabase();
const prefix = `phase07-quick-add-${process.pid}-${Date.now()}`;

test.before(async () => {
  await database.initialize();
});

test.after(async () => {
  await database.cleanup();
});

async function createUser(label: string) {
  return database.prisma.user.create({
    data: {
      name: `快捷加购用户 ${label}`,
      email: `${prefix}-${label}@example.com`,
      passwordHash: "not-used",
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
}) {
  const category = await database.prisma.category.create({
    data: {
      name: `快捷加购分类 ${label}`,
      slug: `${prefix}-${label}-category`,
    },
  });

  return database.prisma.product.create({
    data: {
      name: `快捷加购商品 ${label}`,
      slug: `${prefix}-${label}-product`,
      price: 1_990,
      stock,
      isActive,
      categoryId: category.id,
    },
  });
}

function cartServiceFor(userId: string | null) {
  return createCartService({
    prisma: database.prisma,
    getCurrentUserId: async () => userId,
  });
}

function quickAddForm(productId: string) {
  const formData = new FormData();
  formData.set("productId", productId);
  formData.set("quantity", "1");
  return formData;
}

test("adds one unit to the signed-in user's cart", async () => {
  const user = await createUser("success");
  const product = await createProduct({ label: "success", stock: 4 });
  const state = await executeAddToCart(
    quickAddForm(product.id),
    cartServiceFor(user.id).addCartItem,
  );

  assert.equal(state.status, "success");
  assert.equal(state.totalQuantity, 1);
  assert.equal(
    (
      await database.prisma.cartItem.findFirstOrThrow({
        where: {
          productId: product.id,
          cart: { userId: user.id },
        },
      })
    ).quantity,
    1,
  );
});

test("rejects unauthenticated quick-add without creating a cart", async () => {
  const product = await createProduct({ label: "signed-out", stock: 4 });
  const state = await executeAddToCart(
    quickAddForm(product.id),
    cartServiceFor(null).addCartItem,
  );

  assert.equal(state.status, "unauthenticated");
  assert.equal(
    await database.prisma.cartItem.count({
      where: { productId: product.id },
    }),
    0,
  );
});

test("rejects inactive and insufficient-stock products", async () => {
  const user = await createUser("invalid-products");
  const inactive = await createProduct({
    label: "inactive",
    stock: 5,
    isActive: false,
  });
  const lowStock = await createProduct({
    label: "low-stock",
    stock: 0,
  });
  const addCartItem = cartServiceFor(user.id).addCartItem;

  const inactiveState = await executeAddToCart(
    quickAddForm(inactive.id),
    addCartItem,
  );
  const lowStockState = await executeAddToCart(
    quickAddForm(lowStock.id),
    addCartItem,
  );

  assert.equal(inactiveState.status, "error");
  assert.match(inactiveState.message ?? "", /下架/);
  assert.equal(lowStockState.status, "error");
  assert.match(lowStockState.message ?? "", /缺货/);
});

test("rapid repeated quick-add attempts never exceed stock", async () => {
  const user = await createUser("rapid");
  const product = await createProduct({ label: "rapid", stock: 1 });
  const addCartItem = cartServiceFor(user.id).addCartItem;
  const results = await Promise.all([
    executeAddToCart(quickAddForm(product.id), addCartItem),
    executeAddToCart(quickAddForm(product.id), addCartItem),
  ]);
  const cart = await cartServiceFor(user.id).getCart();

  assert.equal(
    results.filter((result) => result.status === "success").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "error").length,
    1,
  );
  assert.equal(cart.items[0].quantity, 1);
  assert.ok(cart.items[0].quantity <= product.stock);
});

test("keeps different users' quick-add carts isolated", async () => {
  const userA = await createUser("a");
  const userB = await createUser("b");
  const product = await createProduct({ label: "isolated", stock: 8 });

  await executeAddToCart(
    quickAddForm(product.id),
    cartServiceFor(userA.id).addCartItem,
  );
  await executeAddToCart(
    quickAddForm(product.id),
    cartServiceFor(userB.id).addCartItem,
  );

  const cartA = await cartServiceFor(userA.id).getCart();
  const cartB = await cartServiceFor(userB.id).getCart();
  assert.equal(cartA.totalQuantity, 1);
  assert.equal(cartB.totalQuantity, 1);
  assert.notEqual(cartA.id, cartB.id);
});

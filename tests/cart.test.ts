import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  CartError,
  createCartService,
  type CartService,
} from "../src/lib/cart-service";

const prisma = new PrismaClient();
const testPrefix = `phase05-2-cart-${process.pid}-${Date.now()}`;
let fixtureSequence = 0;

type ProductFixture = {
  id: string;
  name: string;
  price: number;
  stock: number;
  isActive: boolean;
};

function nextFixtureName(label: string) {
  fixtureSequence += 1;
  return `${testPrefix}-${fixtureSequence}-${label}`;
}

async function createUser(label: string) {
  const fixture = nextFixtureName(label);

  return prisma.user.create({
    data: {
      name: `Cart Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-cart-tests",
    },
  });
}

async function createProduct({
  label,
  price,
  stock,
  isActive = true,
  imageUrl = null,
}: {
  label: string;
  price: number;
  stock: number;
  isActive?: boolean;
  imageUrl?: string | null;
}): Promise<ProductFixture> {
  const fixture = nextFixtureName(label);
  const category = await prisma.category.create({
    data: {
      name: `Cart Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: `Cart Product ${label}`,
      slug: `${fixture}-product`,
      price,
      stock,
      isActive,
      imageUrl,
      categoryId: category.id,
    },
  });

  return {
    id: product.id,
    name: product.name,
    price: product.price,
    stock: product.stock,
    isActive: product.isActive,
  };
}

function serviceFor(userId: string | null): CartService {
  return createCartService({
    prisma,
    getCurrentUserId: async () => userId,
  });
}

function assertCartError(error: unknown, code: CartError["code"]) {
  assert.ok(error instanceof CartError);
  assert.equal(error.code, code);
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

test("rejects every cart operation when the user is not signed in", async () => {
  const service = serviceFor(null);

  await assert.rejects(service.getCart, (error) => {
    assertCartError(error, "UNAUTHENTICATED");
    return true;
  });
  await assert.rejects(
    service.addCartItem({ productId: "missing-product", quantity: 1 }),
    (error) => {
      assertCartError(error, "UNAUTHENTICATED");
      return true;
    },
  );
  await assert.rejects(
    service.updateCartItemQuantity({
      cartItemId: "missing-item",
      quantity: 1,
    }),
    (error) => {
      assertCartError(error, "UNAUTHENTICATED");
      return true;
    },
  );
  await assert.rejects(service.removeCartItem("missing-item"), (error) => {
    assertCartError(error, "UNAUTHENTICATED");
    return true;
  });
  await assert.rejects(service.clearCart, (error) => {
    assertCartError(error, "UNAUTHENTICATED");
    return true;
  });
});

test("adds an active product and returns server-calculated totals", async () => {
  const user = await createUser("add");
  const product = await createProduct({
    label: "add",
    price: 1999,
    stock: 5,
    imageUrl: "/images/catalog/cart-add.jpg",
  });
  const service = serviceFor(user.id);

  const cart = await service.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].productId, product.id);
  assert.equal(cart.items[0].name, product.name);
  assert.equal(cart.items[0].imageUrl, "/images/catalog/cart-add.jpg");
  assert.equal(cart.items[0].price, 1999);
  assert.equal(cart.items[0].quantity, 2);
  assert.equal(cart.items[0].subtotal, 3998);
  assert.equal(cart.items[0].stock, 5);
  assert.equal(cart.items[0].isActive, true);
  assert.equal(cart.totalQuantity, 2);
  assert.equal(cart.totalAmount, 3998);
});

test("accumulates quantity when the same product is added again", async () => {
  const user = await createUser("duplicate");
  const product = await createProduct({
    label: "duplicate",
    price: 500,
    stock: 5,
  });
  const service = serviceFor(user.id);

  await service.addCartItem({ productId: product.id, quantity: 1 });
  const cart = await service.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 3);
  assert.equal(cart.totalQuantity, 3);
  assert.equal(cart.totalAmount, 1500);
});

test("keeps concurrent additions within the current stock", async () => {
  const user = await createUser("concurrent");
  const product = await createProduct({
    label: "concurrent",
    price: 100,
    stock: 4,
  });
  const service = serviceFor(user.id);

  await Promise.all([
    service.addCartItem({ productId: product.id, quantity: 2 }),
    service.addCartItem({ productId: product.id, quantity: 2 }),
  ]);

  const cart = await service.getCart();
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 4);
  assert.equal(cart.totalQuantity, 4);
});

test("rejects adding more than the current stock", async () => {
  const user = await createUser("overstock");
  const product = await createProduct({
    label: "overstock",
    price: 100,
    stock: 2,
  });

  await assert.rejects(
    serviceFor(user.id).addCartItem({
      productId: product.id,
      quantity: 3,
    }),
    (error) => {
      assertCartError(error, "INSUFFICIENT_STOCK");
      return true;
    },
  );
});

test("rejects an inactive product", async () => {
  const user = await createUser("inactive");
  const product = await createProduct({
    label: "inactive",
    price: 100,
    stock: 5,
    isActive: false,
  });

  await assert.rejects(
    serviceFor(user.id).addCartItem({
      productId: product.id,
      quantity: 1,
    }),
    (error) => {
      assertCartError(error, "PRODUCT_INACTIVE");
      return true;
    },
  );
});

test("rejects a product whose stock is zero", async () => {
  const user = await createUser("empty-stock");
  const product = await createProduct({
    label: "empty-stock",
    price: 100,
    stock: 0,
  });

  await assert.rejects(
    serviceFor(user.id).addCartItem({
      productId: product.id,
      quantity: 1,
    }),
    (error) => {
      assertCartError(error, "OUT_OF_STOCK");
      return true;
    },
  );
});

test("rejects unknown products with an explicit error", async () => {
  const user = await createUser("missing-product");

  await assert.rejects(
    serviceFor(user.id).addCartItem({
      productId: nextFixtureName("missing-product-id"),
      quantity: 1,
    }),
    (error) => {
      assertCartError(error, "PRODUCT_NOT_FOUND");
      return true;
    },
  );
});

test("rejects non-positive, fractional, and non-finite quantities", async () => {
  const user = await createUser("quantity");
  const product = await createProduct({
    label: "quantity",
    price: 100,
    stock: 5,
  });
  const service = serviceFor(user.id);

  for (const quantity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(
      service.addCartItem({ productId: product.id, quantity }),
      (error) => {
        assertCartError(error, "INVALID_QUANTITY");
        return true;
      },
    );
  }
});

test("updates the quantity of an item owned by the current user", async () => {
  const user = await createUser("update");
  const product = await createProduct({
    label: "update",
    price: 250,
    stock: 5,
  });
  const service = serviceFor(user.id);
  const added = await service.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  const updated = await service.updateCartItemQuantity({
    cartItemId: added.items[0].id,
    quantity: 4,
  });

  assert.equal(updated.items[0].quantity, 4);
  assert.equal(updated.totalQuantity, 4);
  assert.equal(updated.totalAmount, 1000);
});

test("rejects an update above current stock without changing quantity", async () => {
  const user = await createUser("update-overstock");
  const product = await createProduct({
    label: "update-overstock",
    price: 100,
    stock: 3,
  });
  const service = serviceFor(user.id);
  const added = await service.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  await assert.rejects(
    service.updateCartItemQuantity({
      cartItemId: added.items[0].id,
      quantity: 4,
    }),
    (error) => {
      assertCartError(error, "INSUFFICIENT_STOCK");
      return true;
    },
  );

  const cart = await service.getCart();
  assert.equal(cart.items[0].quantity, 2);
});

test("allows reducing quantity for an inactive product but rejects increases", async () => {
  const user = await createUser("update-inactive");
  const product = await createProduct({
    label: "update-inactive",
    price: 100,
    stock: 5,
  });
  const service = serviceFor(user.id);
  const added = await service.addCartItem({
    productId: product.id,
    quantity: 3,
  });

  await prisma.product.update({
    where: { id: product.id },
    data: { isActive: false },
  });

  await assert.rejects(
    service.updateCartItemQuantity({
      cartItemId: added.items[0].id,
      quantity: 4,
    }),
    (error) => {
      assertCartError(error, "PRODUCT_INACTIVE");
      return true;
    },
  );

  const updated = await service.updateCartItemQuantity({
    cartItemId: added.items[0].id,
    quantity: 2,
  });
  assert.equal(updated.items[0].quantity, 2);
});

test("removes an item owned by the current user", async () => {
  const user = await createUser("remove");
  const product = await createProduct({
    label: "remove",
    price: 100,
    stock: 5,
  });
  const service = serviceFor(user.id);
  const added = await service.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  const cart = await service.removeCartItem(added.items[0].id);

  assert.equal(cart.items.length, 0);
  assert.equal(cart.totalQuantity, 0);
  assert.equal(cart.totalAmount, 0);
});

test("clears only the current user's cart", async () => {
  const userA = await createUser("clear-a");
  const userB = await createUser("clear-b");
  const product = await createProduct({
    label: "clear",
    price: 100,
    stock: 10,
  });
  const serviceA = serviceFor(userA.id);
  const serviceB = serviceFor(userB.id);

  await serviceA.addCartItem({ productId: product.id, quantity: 2 });
  await serviceB.addCartItem({ productId: product.id, quantity: 1 });

  const cleared = await serviceA.clearCart();
  const cartB = await serviceB.getCart();

  assert.equal(cleared.items.length, 0);
  assert.equal(cleared.totalQuantity, 0);
  assert.equal(cartB.items.length, 1);
  assert.equal(cartB.items[0].quantity, 1);
});

test("does not let user A read user B's cart", async () => {
  const userA = await createUser("read-a");
  const userB = await createUser("read-b");
  const product = await createProduct({
    label: "read",
    price: 100,
    stock: 5,
  });
  const serviceA = serviceFor(userA.id);
  const serviceB = serviceFor(userB.id);

  await serviceB.addCartItem({ productId: product.id, quantity: 2 });
  const cartA = await serviceA.getCart();
  const cartB = await serviceB.getCart();

  assert.equal(cartA.items.length, 0);
  assert.notEqual(cartA.id, cartB.id);
  assert.equal(cartB.items.length, 1);
  assert.equal(cartB.items[0].quantity, 2);
});

test("does not let user A update user B's cart item", async () => {
  const userA = await createUser("modify-a");
  const userB = await createUser("modify-b");
  const product = await createProduct({
    label: "modify",
    price: 100,
    stock: 5,
  });
  const serviceA = serviceFor(userA.id);
  const serviceB = serviceFor(userB.id);
  const cartB = await serviceB.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  await assert.rejects(
    serviceA.updateCartItemQuantity({
      cartItemId: cartB.items[0].id,
      quantity: 1,
    }),
    (error) => {
      assertCartError(error, "CART_ITEM_NOT_FOUND");
      return true;
    },
  );

  const unchanged = await serviceB.getCart();
  assert.equal(unchanged.items[0].quantity, 2);
});

test("does not let user A delete user B's cart item", async () => {
  const userA = await createUser("delete-a");
  const userB = await createUser("delete-b");
  const product = await createProduct({
    label: "delete",
    price: 100,
    stock: 5,
  });
  const serviceA = serviceFor(userA.id);
  const serviceB = serviceFor(userB.id);
  const cartB = await serviceB.addCartItem({
    productId: product.id,
    quantity: 2,
  });

  await assert.rejects(
    serviceA.removeCartItem(cartB.items[0].id),
    (error) => {
      assertCartError(error, "CART_ITEM_NOT_FOUND");
      return true;
    },
  );

  const unchanged = await serviceB.getCart();
  assert.equal(unchanged.items.length, 1);
  assert.equal(unchanged.items[0].quantity, 2);
});

test("recalculates totals from the latest database price for every item", async () => {
  const user = await createUser("totals");
  const productA = await createProduct({
    label: "totals-a",
    price: 1999,
    stock: 8,
  });
  const productB = await createProduct({
    label: "totals-b",
    price: 250,
    stock: 3,
  });
  const service = serviceFor(user.id);

  await service.addCartItem({ productId: productA.id, quantity: 2 });
  await service.addCartItem({ productId: productB.id, quantity: 1 });

  await prisma.product.update({
    where: { id: productA.id },
    data: {
      name: "Updated Cart Product A",
      price: 2499,
      isActive: false,
    },
  });

  const cart = await service.getCart();
  const itemA = cart.items.find((item) => item.productId === productA.id);
  const itemB = cart.items.find((item) => item.productId === productB.id);

  assert.ok(itemA);
  assert.ok(itemB);
  assert.equal(itemA.name, "Updated Cart Product A");
  assert.equal(itemA.price, 2499);
  assert.equal(itemA.subtotal, 4998);
  assert.equal(itemA.stock, 8);
  assert.equal(itemA.isActive, false);
  assert.equal(itemB.subtotal, 250);
  assert.equal(cart.totalQuantity, 3);
  assert.equal(cart.totalAmount, 5248);
});

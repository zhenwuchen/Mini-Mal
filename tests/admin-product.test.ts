import assert from "node:assert/strict";
import test from "node:test";

import { createIsolatedAdminTestDatabase } from "./helpers/test-database";
import {
  AdminProductError,
  createAdminProductService,
} from "../src/lib/admin-product-service";
import {
  formatAdminPriceInput,
  normalizeAdminProductSearchParams,
  parseAdminProductForm,
} from "../src/lib/admin-product";

const database = createIsolatedAdminTestDatabase();
const service = createAdminProductService({ prisma: database.prisma });

function productForm(
  overrides: Record<string, string> = {},
): FormData {
  const form = new FormData();
  form.set("name", "测试台灯");
  form.set("description", "柔和光线，适合阅读。");
  form.set("price", "129.90");
  form.set("imageUrl", "/images/catalog/nordic-table-lamp.jpg");
  form.set("stock", "18");
  form.set("categoryId", "category-1");
  form.set("isActive", "true");

  for (const [key, value] of Object.entries(overrides)) {
    form.set(key, value);
  }

  return form;
}

function assertProductError(
  error: unknown,
  code: ConstructorParameters<typeof AdminProductError>[0],
) {
  assert.ok(error instanceof AdminProductError);
  assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /Prisma|SQL|stack/i);
}

test.before(async () => {
  await database.initialize();
});

test.after(async () => {
  await database.cleanup();
});

test("parses exact cent prices and non-negative integer stock", () => {
  assert.equal(formatAdminPriceInput(12_990), "129.90");

  const parsed = parseAdminProductForm(productForm());

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data, {
    name: "测试台灯",
    description: "柔和光线，适合阅读。",
    price: 12_990,
    imageUrl: "/images/catalog/nordic-table-lamp.jpg",
    stock: 18,
    categoryId: "category-1",
    isActive: true,
  });
});

test("accepts zero price and zero stock", () => {
  const parsed = parseAdminProductForm(
    productForm({ price: "0.00", stock: "0" }),
  );

  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.price, 0);
  assert.equal(parsed.data.stock, 0);
});

test("rejects malformed prices and inventory", () => {
  for (const price of ["", "-0.01", "12.345", "12,50", "abc"]) {
    const parsed = parseAdminProductForm(productForm({ price }));
    assert.equal(parsed.success, false);
    assert.match(parsed.errors.price ?? "", /价格/);
  }

  for (const stock of ["", "-1", "1.5", "1e3", "abc"]) {
    const parsed = parseAdminProductForm(productForm({ stock }));
    assert.equal(parsed.success, false);
    assert.match(parsed.errors.stock ?? "", /库存/);
  }
});

test("rejects unsafe image URLs and missing category selection", () => {
  const scriptUrl = parseAdminProductForm(
    productForm({ imageUrl: "javascript:alert(1)" }),
  );
  assert.equal(scriptUrl.success, false);
  assert.match(scriptUrl.errors.imageUrl ?? "", /图片/);

  const remoteUrl = parseAdminProductForm(
    productForm({ imageUrl: "https://example.com/product.jpg" }),
  );
  assert.equal(remoteUrl.success, false);
  assert.match(remoteUrl.errors.imageUrl ?? "", /站内/);

  const noCategory = parseAdminProductForm(
    productForm({ categoryId: "" }),
  );
  assert.equal(noCategory.success, false);
  assert.match(noCategory.errors.categoryId ?? "", /分类/);
});

test("normalizes product filters and pagination", () => {
  assert.deepEqual(
    normalizeAdminProductSearchParams({
      q: "  台灯 ",
      category: "category-1",
      status: "active",
      page: "3",
    }),
    {
      q: "台灯",
      categoryId: "category-1",
      status: "active",
      page: 3,
    },
  );

  assert.deepEqual(
    normalizeAdminProductSearchParams({
      q: "",
      category: "all",
      status: "not-a-status",
      page: "-4",
    }),
    {
      q: "",
      categoryId: undefined,
      status: "all",
      page: 1,
    },
  );
});

test("creates, filters, updates, toggles, and reads products", async () => {
  const category = await database.prisma.category.create({
    data: {
      name: "测试分类",
      slug: `admin-product-category-${Date.now()}`,
    },
  });
  const created = await service.create({
    name: "桌面收纳盒",
    description: "用于整理桌面小物。",
    price: 4_990,
    imageUrl: null,
    stock: 7,
    categoryId: category.id,
    isActive: true,
  });

  const activePage = await service.list({
    q: "收纳",
    categoryId: category.id,
    status: "active",
    page: 1,
  });
  assert.equal(activePage.totalCount, 1);
  assert.equal(activePage.products[0].id, created.id);
  assert.equal(activePage.products[0].price, 4_990);
  assert.equal(activePage.products[0].category.name, "测试分类");

  const updated = await service.update(created.id, {
    name: "桌面收纳盒 2",
    description: null,
    price: 5_100,
    imageUrl: "/images/catalog/nordic-table-lamp.jpg",
    stock: 9,
    categoryId: category.id,
    isActive: true,
  });
  assert.equal(updated.id, created.id);

  await service.setActive(created.id, false);
  const inactivePage = await service.list({
    q: "",
    categoryId: category.id,
    status: "inactive",
    page: 1,
  });
  assert.equal(inactivePage.totalCount, 1);
  assert.equal(inactivePage.products[0].isActive, false);
  assert.equal(inactivePage.products[0].stock, 9);
});

test("refuses products whose category does not exist", async () => {
  await assert.rejects(
    service.create({
      name: "不存在分类商品",
      description: null,
      price: 100,
      imageUrl: null,
      stock: 1,
      categoryId: "missing-category",
      isActive: true,
    }),
    (error) => {
      assertProductError(error, "CATEGORY_NOT_FOUND");
      return true;
    },
  );
});

test("archives products with order history without leaving the order snapshot", async () => {
  const category = await database.prisma.category.create({
    data: {
      name: "历史订单分类",
      slug: `admin-product-history-category-${Date.now()}`,
    },
  });
  const product = await service.create({
    name: "历史订单商品",
    description: null,
    price: 8_800,
    imageUrl: null,
    stock: 3,
    categoryId: category.id,
    isActive: true,
  });
  const user = await database.prisma.user.create({
    data: {
      email: `admin-product-${Date.now()}@example.com`,
      passwordHash: "not-used",
    },
  });
  const order = await database.prisma.order.create({
    data: {
      orderNumber: `ADMIN-PRODUCT-${Date.now()}`,
      userId: user.id,
      totalAmount: 8_800,
      shippingName: "测试用户",
      shippingPhone: "13800138000",
      shippingAddress: "测试地址",
      items: {
        create: {
          productId: product.id,
          productName: "历史订单商品",
          productSlug: "history-product",
          productImageUrl: null,
          unitPrice: 8_800,
          quantity: 1,
          subtotal: 8_800,
        },
      },
    },
  });

  const result = await service.archive(product.id);
  const archived = await database.prisma.product.findUniqueOrThrow({
    where: { id: product.id },
  });
  const savedItem = await database.prisma.orderItem.findFirstOrThrow({
    where: { orderId: order.id },
  });

  assert.equal(result.mode, "ARCHIVED");
  assert.equal(result.name, "历史订单商品");
  assert.equal(result.hadOrderHistory, true);
  assert.equal(archived.isActive, false);
  assert.equal(savedItem.productName, "历史订单商品");
  assert.equal(savedItem.productId, product.id);
});

test("clamps the last product page after archiving its final item", async () => {
  const category = await database.prisma.category.create({
    data: {
      name: "分页归档分类",
      slug: `admin-product-pagination-${Date.now()}`,
    },
  });

  for (let index = 0; index < 13; index += 1) {
    await service.create({
      name: `分页归档商品 ${index + 1}`,
      description: null,
      price: 1_000 + index,
      imageUrl: null,
      stock: 1,
      categoryId: category.id,
      isActive: true,
    });
  }

  const secondPage = await service.list({
    q: "",
    categoryId: category.id,
    status: "active",
    page: 2,
  });
  assert.equal(secondPage.page, 2);
  assert.equal(secondPage.products.length, 1);

  await service.archive(secondPage.products[0].id);

  const afterArchive = await service.list({
    q: "",
    categoryId: category.id,
    status: "active",
    page: 2,
  });

  assert.equal(afterArchive.totalCount, 12);
  assert.equal(afterArchive.totalPages, 1);
  assert.equal(afterArchive.page, 1);
  assert.equal(afterArchive.products.length, 12);
});

import assert from "node:assert/strict";
import test from "node:test";

import { getProductDetail } from "../src/lib/products";
import { createIsolatedStorefrontTestDatabase } from "./helpers/test-database";

const database = createIsolatedStorefrontTestDatabase();
const prefix = `phase08-4-detail-${process.pid}-${Date.now()}`;

test.before(async () => {
  await database.initialize();
});

test.after(async () => {
  await database.cleanup();
});

test("product detail queries the product selected by its slug", async () => {
  const category = await database.prisma.category.create({
    data: {
      name: "详情导航测试分类",
      slug: `${prefix}-category`,
    },
  });
  const firstProduct = await database.prisma.product.create({
    data: {
      name: "详情导航测试商品 A",
      slug: `${prefix}-product-a`,
      price: 8_800,
      stock: 8,
      categoryId: category.id,
    },
  });
  const secondProduct = await database.prisma.product.create({
    data: {
      name: "详情导航测试商品 B",
      slug: `${prefix}-product-b`,
      price: 6_600,
      stock: 5,
      categoryId: category.id,
    },
  });

  const first = await getProductDetail(firstProduct.slug);
  const second = await getProductDetail(secondProduct.slug);

  assert.equal(first?.product.name, "详情导航测试商品 A");
  assert.equal(first?.product.slug, firstProduct.slug);
  assert.equal(second?.product.name, "详情导航测试商品 B");
  assert.equal(second?.product.slug, secondProduct.slug);
});

test("product detail returns not found for an unknown slug", async () => {
  assert.equal(
    await getProductDetail(`${prefix}-missing-product`),
    null,
  );
});

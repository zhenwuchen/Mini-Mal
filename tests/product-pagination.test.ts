import assert from "node:assert/strict";
import test from "node:test";

import { createIsolatedStorefrontTestDatabase } from "./helpers/test-database";
import {
  buildCatalogPageHref,
  CATALOG_PAGE_SIZE,
  normalizeProductSearchParams,
  updateCatalogSearchParams,
} from "../src/lib/product-catalog";
import { createProductCatalogService } from "../src/lib/product-catalog-service";

const database = createIsolatedStorefrontTestDatabase();
const catalog = createProductCatalogService({ prisma: database.prisma });
const prefix = `phase07-pagination-${process.pid}-${Date.now()}`;

test.before(async () => {
  await database.initialize();
  const firstCategory = await database.prisma.category.create({
    data: {
      name: "分页耳机分类",
      slug: `${prefix}-earbuds`,
    },
  });
  const secondCategory = await database.prisma.category.create({
    data: {
      name: "分页台灯分类",
      slug: `${prefix}-lamps`,
    },
  });

  for (let index = 0; index < 30; index += 1) {
    const isEarbud = index < 15;
    await database.prisma.product.create({
      data: {
        name: isEarbud
          ? `分页耳机 ${String(index + 1).padStart(2, "0")}`
          : `分页台灯 ${String(index + 1).padStart(2, "0")}`,
        slug: `${prefix}-product-${index + 1}`,
        price: 1_000 + index * 100,
        stock: 30 - index,
        categoryId: isEarbud
          ? firstCategory.id
          : secondCategory.id,
      },
    });
  }
});

test.after(async () => {
  await database.cleanup();
});

test("normalizes page parameters and resets them when filters change", () => {
  assert.equal(CATALOG_PAGE_SIZE, 12);
  assert.deepEqual(
    normalizeProductSearchParams({
      search: "  耳机  ",
      category: "earbuds",
      sort: "price-desc",
      page: "3",
    }),
    {
      q: "耳机",
      category: "earbuds",
      sort: "price-desc",
      page: 3,
    },
  );
  assert.equal(normalizeProductSearchParams({ page: "0" }).page, 1);
  assert.equal(normalizeProductSearchParams({ page: "-2" }).page, 1);
  assert.equal(normalizeProductSearchParams({ page: "1.5" }).page, 1);
  assert.equal(normalizeProductSearchParams({ page: "abc" }).page, 1);

  const current = new URLSearchParams(
    "search=耳机&category=earbuds&sort=price-asc&page=3&focus=search",
  );
  assert.equal(
    updateCatalogSearchParams(current, { category: "lamps" }).toString(),
    "search=%E8%80%B3%E6%9C%BA&category=lamps&sort=price-asc",
  );
  assert.equal(
    updateCatalogSearchParams(current, { page: 4 }).toString(),
    "search=%E8%80%B3%E6%9C%BA&category=earbuds&sort=price-asc&page=4",
  );
});

test("builds pagination links that preserve search, category, and sort", () => {
  assert.equal(
    buildCatalogPageHref(
      {
        q: "耳机",
        category: "earbuds",
        sort: "price-asc",
        page: 1,
      },
      2,
    ),
    "/products?search=%E8%80%B3%E6%9C%BA&category=earbuds&sort=price-asc&page=2",
  );
  assert.equal(
    buildCatalogPageHref(
      { q: "", category: "", sort: "featured", page: 2 },
      1,
    ),
    "/products",
  );
});

test("returns the first, middle, and last database pages", async () => {
  const first = await catalog.getCatalogPageData({
    q: "",
    category: "",
    sort: "featured",
    page: 1,
  });
  const middle = await catalog.getCatalogPageData({
    q: "",
    category: "",
    sort: "featured",
    page: 2,
  });
  const last = await catalog.getCatalogPageData({
    q: "",
    category: "",
    sort: "featured",
    page: 3,
  });

  assert.equal(first.filteredCount, 30);
  assert.equal(first.totalPages, 3);
  assert.equal(first.products.length, 12);
  assert.equal(first.products[0].name, "分页耳机 01");
  assert.equal(first.products[11].name, "分页耳机 12");

  assert.equal(middle.page, 2);
  assert.equal(middle.products.length, 12);
  assert.equal(middle.products[0].name, "分页耳机 13");
  assert.equal(middle.products[11].name, "分页台灯 24");

  assert.equal(last.page, 3);
  assert.equal(last.products.length, 6);
  assert.equal(last.products[0].name, "分页台灯 25");
});

test("clamps out-of-range pages to the last page", async () => {
  const result = await catalog.getCatalogPageData({
    q: "",
    category: "",
    sort: "featured",
    page: 999,
  });

  assert.equal(result.page, 3);
  assert.equal(result.totalPages, 3);
  assert.equal(result.products.length, 6);
});

test("combines search with server-side pagination", async () => {
  const first = await catalog.getCatalogPageData({
    q: "耳机",
    category: "",
    sort: "featured",
    page: 1,
  });
  const second = await catalog.getCatalogPageData({
    q: "耳机",
    category: "",
    sort: "featured",
    page: 2,
  });

  assert.equal(first.filteredCount, 15);
  assert.equal(first.totalPages, 2);
  assert.equal(first.products.length, 12);
  assert.equal(second.products.length, 3);
  assert.ok(
    second.products.every((product) => product.name.includes("耳机")),
  );
});

test("combines category and sort filters with pagination", async () => {
  const categoryPage = await catalog.getCatalogPageData({
    q: "",
    category: `${prefix}-lamps`,
    sort: "price-desc",
    page: 1,
  });
  const pricePage = await catalog.getCatalogPageData({
    q: "",
    category: "",
    sort: "price-asc",
    page: 2,
  });

  assert.equal(categoryPage.filteredCount, 15);
  assert.equal(categoryPage.totalPages, 2);
  assert.equal(categoryPage.products.length, 12);
  assert.ok(
    categoryPage.products.every(
      (product) => product.categorySlug === `${prefix}-lamps`,
    ),
  );
  assert.equal(categoryPage.products[0].name, "分页台灯 30");

  assert.equal(pricePage.page, 2);
  assert.equal(pricePage.products[0].name, "分页耳机 13");
  assert.deepEqual(
    pricePage.products.map((product) => product.price),
    [
      2_200, 2_300, 2_400, 2_500, 2_600, 2_700,
      2_800, 2_900, 3_000, 3_100, 3_200, 3_300,
    ],
  );
});

test("returns a safe empty first page when filtering has no results", async () => {
  const result = await catalog.getCatalogPageData({
    q: "不存在的商品",
    category: "",
    sort: "featured",
    page: 8,
  });

  assert.equal(result.page, 1);
  assert.equal(result.filteredCount, 0);
  assert.equal(result.totalPages, 0);
  assert.deepEqual(result.products, []);
});

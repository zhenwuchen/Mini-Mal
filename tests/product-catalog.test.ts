import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductOrderBy,
  buildProductWhere,
  deriveProductTag,
  normalizeProductSearchParams,
  updateCatalogSearchParams,
} from "../src/lib/product-catalog";

test("normalizes URL search params for the product catalog", () => {
  assert.deepEqual(
    normalizeProductSearchParams({
      search: ["  耳机  "],
      category: "electronics",
      sort: "price-desc",
    }),
    {
      q: "耳机",
      category: "electronics",
      sort: "price-desc",
    },
  );
});

test("supports the latest-product sort from URL search params", () => {
  assert.deepEqual(
    normalizeProductSearchParams({
      search: "台灯",
      category: "home-living",
      sort: "newest",
    }),
    {
      q: "台灯",
      category: "home-living",
      sort: "newest",
    },
  );
});

test("keeps the legacy q parameter compatible", () => {
  assert.equal(normalizeProductSearchParams({ q: "鼠标" }).q, "鼠标");
});

test("falls back to featured sorting for unsupported sort values", () => {
  assert.deepEqual(
    normalizeProductSearchParams({
      search: "",
      category: "",
      sort: "unknown",
    }),
    {
      q: "",
      category: "",
      sort: "featured",
    },
  );
});

test("builds active product filters from search and category", () => {
  assert.deepEqual(
    buildProductWhere({ q: "杯", category: "home-living", sort: "featured" }),
    {
      isActive: true,
      name: { contains: "杯" },
      category: { is: { slug: "home-living" } },
    },
  );
});

test("omits empty product filters", () => {
  assert.deepEqual(
    buildProductWhere({ q: "", category: "", sort: "featured" }),
    { isActive: true },
  );
});

test("maps sort values to stable Prisma order clauses", () => {
  assert.deepEqual(buildProductOrderBy("price-asc"), [
    { price: "asc" },
    { name: "asc" },
  ]);
  assert.deepEqual(buildProductOrderBy("price-desc"), [
    { price: "desc" },
    { name: "asc" },
  ]);
  assert.deepEqual(buildProductOrderBy("featured"), [
    { stock: "desc" },
    { createdAt: "desc" },
    { name: "asc" },
  ]);
  assert.deepEqual(buildProductOrderBy("newest"), [
    { createdAt: "desc" },
    { name: "asc" },
  ]);
});

test("updates one catalog filter without dropping the others", () => {
  const params = new URLSearchParams(
    "category=fashion&search=%E5%8D%AB%E8%A1%A3&sort=price-asc&source=nav",
  );

  assert.equal(
    updateCatalogSearchParams(params, { search: "  耳机  " }).toString(),
    "category=fashion&search=%E8%80%B3%E6%9C%BA&sort=price-asc&source=nav",
  );
  assert.equal(
    updateCatalogSearchParams(params, { category: "" }).toString(),
    "search=%E5%8D%AB%E8%A1%A3&sort=price-asc&source=nav",
  );
  assert.equal(
    updateCatalogSearchParams(params, { sort: "featured" }).toString(),
    "category=fashion&search=%E5%8D%AB%E8%A1%A3&source=nav",
  );
});

test("derives a limited tag only for low-stock products", () => {
  assert.equal(deriveProductTag(30), "LIMITED");
  assert.equal(deriveProductTag(31), undefined);
});


import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHeaderSearchHref,
  normalizeHeaderSearchQuery,
} from "../src/lib/header-search";

test("normalizes and trims header search keywords", () => {
  assert.equal(normalizeHeaderSearchQuery("  蓝牙耳机  "), "蓝牙耳机");
  assert.equal(normalizeHeaderSearchQuery(""), "");
  assert.equal(
    normalizeHeaderSearchQuery("名".repeat(100)).length,
    80,
  );
});

test("builds a product-list search URL with focus state", () => {
  assert.equal(
    buildHeaderSearchHref("蓝牙耳机"),
    "/products?search=%E8%93%9D%E7%89%99%E8%80%B3%E6%9C%BA&focus=search",
  );
  assert.equal(
    buildHeaderSearchHref("  "),
    "/products?focus=search",
  );
});

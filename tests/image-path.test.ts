import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidLocalImagePath,
  normalizeLocalImagePath,
} from "../src/lib/image-path";

const fallback = "/images/categories/home-living.jpg";

test("accepts safe local raster images under /images", () => {
  for (const value of [
    "/images/catalog/nordic-table-lamp.jpg",
    "/images/categories/home-living.png",
    "/images/uploads/product_01.webp",
    "/images/uploads/product-02.avif",
  ]) {
    assert.equal(isValidLocalImagePath(value), true, value);
    assert.equal(normalizeLocalImagePath(value, fallback), value);
  }
});

test("rejects remote, protocol-relative, and unsafe image paths", () => {
  for (const value of [
    "https://example.com/image.jpg",
    "http://example.com/image.jpg",
    "//cdn.example.com/image.jpg",
    "javascript:alert(1)",
    "data:image/png;base64,abc",
    "/images/../private.jpg",
    "/images/%2e%2e/private.jpg",
    "/images/catalog/file.jpg?version=1",
    "/images/catalog/file.svg",
    "\\images\\catalog\\file.jpg",
    "images/catalog/file.jpg",
    " /images/catalog/file.jpg ",
  ]) {
    assert.equal(isValidLocalImagePath(value), false, value);
    assert.equal(normalizeLocalImagePath(value, fallback), fallback);
  }
});

test("uses the supplied fallback for empty and invalid stored values", () => {
  assert.equal(normalizeLocalImagePath(null, fallback), fallback);
  assert.equal(normalizeLocalImagePath("  ", fallback), fallback);
  assert.equal(normalizeLocalImagePath("https://example.com/a.jpg", fallback), fallback);
});

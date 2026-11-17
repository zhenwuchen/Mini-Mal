import assert from "node:assert/strict";
import test from "node:test";

import {
  canAddToCart,
  getProductAvailability,
  getPurchaseQuantityLimit,
} from "../src/lib/product-purchase";

test("marks inactive products as unavailable before checking stock", () => {
  assert.equal(getProductAvailability({ isActive: false, stock: 12 }), "inactive");
  assert.equal(getProductAvailability({ isActive: true, stock: 0 }), "out-of-stock");
  assert.equal(getProductAvailability({ isActive: true, stock: 3 }), "available");
});

test("uses the exact available stock as the quantity limit", () => {
  assert.equal(getPurchaseQuantityLimit(12), 12);
  assert.equal(getPurchaseQuantityLimit(0), 0);
  assert.equal(getPurchaseQuantityLimit(-4), 0);
});

test("accepts only integer quantities between one and the current stock", () => {
  assert.equal(canAddToCart({ isActive: true, stock: 3, quantity: 1 }), true);
  assert.equal(canAddToCart({ isActive: true, stock: 3, quantity: 3 }), true);
  assert.equal(canAddToCart({ isActive: true, stock: 3, quantity: 0 }), false);
  assert.equal(canAddToCart({ isActive: true, stock: 3, quantity: 4 }), false);
  assert.equal(canAddToCart({ isActive: true, stock: 3, quantity: 1.5 }), false);
  assert.equal(canAddToCart({ isActive: false, stock: 3, quantity: 1 }), false);
  assert.equal(canAddToCart({ isActive: true, stock: 0, quantity: 1 }), false);
});

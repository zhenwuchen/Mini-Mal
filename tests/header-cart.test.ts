import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCartBadgeQuantity,
  getCartAriaLabel,
} from "../src/lib/header-cart";

test("hides the cart badge when the cart is empty", () => {
  assert.equal(formatCartBadgeQuantity(0), null);
  assert.equal(getCartAriaLabel(0), "购物车，当前为空");
});

test("shows the exact cart quantity up to 99", () => {
  assert.equal(formatCartBadgeQuantity(1), "1");
  assert.equal(formatCartBadgeQuantity(27), "27");
  assert.equal(formatCartBadgeQuantity(99), "99");
  assert.equal(getCartAriaLabel(27), "购物车，27 件商品");
});

test("caps the visible badge at 99+ while preserving the full aria label", () => {
  assert.equal(formatCartBadgeQuantity(100), "99+");
  assert.equal(formatCartBadgeQuantity(1500), "99+");
  assert.equal(getCartAriaLabel(100), "购物车，100 件商品");
});

test("treats invalid or negative quantities as an empty cart", () => {
  assert.equal(formatCartBadgeQuantity(-1), null);
  assert.equal(formatCartBadgeQuantity(1.5), null);
  assert.equal(formatCartBadgeQuantity(Number.NaN), null);
  assert.equal(getCartAriaLabel(-1), "购物车，当前为空");
});

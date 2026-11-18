import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeProductDetailScrollIntent,
  markProductDetailScrollIntent,
} from "../src/lib/product-detail-scroll";

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

test("consumes a related-product scroll intent exactly once", () => {
  const storage = createStorage();

  markProductDetailScrollIntent(storage);

  assert.equal(consumeProductDetailScrollIntent(storage), true);
  assert.equal(consumeProductDetailScrollIntent(storage), false);
});

test("does not request scrolling for ordinary product-detail navigation", () => {
  const storage = createStorage();

  assert.equal(consumeProductDetailScrollIntent(storage), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  categories,
  formatPrice,
} from "../src/lib/catalog";

test("homepage exposes the four primary shopping categories", () => {
  assert.deepEqual(
    categories.map((category) => category.name),
    ["Electronics", "Fashion", "Home & Living", "Beauty"],
  );
});

test("prices are formatted from integer fen values", () => {
  assert.equal(formatPrice(12900), "¥129.00");
  assert.equal(formatPrice(990), "¥9.90");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  toOrderPaymentView,
} from "../src/lib/order-query-core";

test("exposes only safe payment fields required by the order experience", () => {
  const view = toOrderPaymentView({
    id: "payment-1",
    status: "FAILED",
    amount: 2_500,
    currency: "CNY",
    failureCode: "MOCK_USER_DECLINED",
    failureReason: "模拟支付被用户拒绝",
    createdAt: new Date("2026-11-18T12:00:00.000Z"),
    paidAt: null,
    providerPaymentId: "provider-secret",
    idempotencyKey: "internal-key",
    provider: "MOCK",
  });

  assert.deepEqual(view, {
    id: "payment-1",
    status: "FAILED",
    amount: 2_500,
    currency: "CNY",
    failureCode: "MOCK_USER_DECLINED",
    failureReason: "模拟支付被用户拒绝",
    createdAt: new Date("2026-11-18T12:00:00.000Z"),
    paidAt: null,
  });
});

test("does not expose an unknown raw payment failure reason", () => {
  const view = toOrderPaymentView({
    id: "payment-2",
    status: "FAILED",
    amount: 1_000,
    currency: "CNY",
    failureCode: "INTERNAL_PROVIDER_CODE",
    failureReason: "upstream-secret-detail",
    createdAt: new Date("2026-11-18T12:05:00.000Z"),
    paidAt: null,
  });

  assert.equal(view.failureReason, null);
});

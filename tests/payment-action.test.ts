import assert from "node:assert/strict";
import test from "node:test";

import {
  executeCompleteMockPayment,
  executeFailMockPayment,
  executeStartMockPayment,
} from "../src/lib/payment-action";
import {
  PaymentError,
  type PaymentFailureCode,
} from "../src/lib/payment-service";

function paymentResult(
  status: "PENDING" | "SUCCEEDED" | "FAILED",
  failureReason: string | null = null,
) {
  return {
    order: {
      orderNumber: "ORDER-1",
      status: status === "SUCCEEDED" ? "PAID" : "PENDING_PAYMENT",
      totalAmount: 2_500,
      currency: "CNY",
      expiresAt: new Date("2026-11-18T12:30:00.000Z"),
      paidAt: status === "SUCCEEDED"
        ? new Date("2026-11-18T12:01:00.000Z")
        : null,
    },
    payment: {
      id: "payment-1",
      status,
      failureCode: status === "FAILED" ? "MOCK_USER_DECLINED" : null,
      failureReason,
      paidAt: status === "SUCCEEDED"
        ? new Date("2026-11-18T12:01:00.000Z")
        : null,
    },
  };
}

test("starts payment with server-side identifiers and ignores client amount", async () => {
  let received: { orderNumber: string; idempotencyKey: string } | undefined;
  const formData = new FormData();
  formData.set("orderNumber", " ORDER-1 ");
  formData.set("idempotencyKey", " payment-attempt-1 ");
  formData.set("amount", "1");
  formData.set("status", "SUCCEEDED");

  const state = await executeStartMockPayment(
    formData,
    async (input) => {
      received = input;
      return paymentResult("PENDING");
    },
  );

  assert.deepEqual(received, {
    orderNumber: "ORDER-1",
    idempotencyKey: "payment-attempt-1",
  });
  assert.equal(state.status, "pending");
  assert.equal(state.paymentId, "payment-1");
  assert.equal(state.totalAmount, 2_500);
});

test("completes the selected payment without trusting a client order state", async () => {
  let received: { orderNumber: string; paymentId: string } | undefined;
  const formData = new FormData();
  formData.set("orderNumber", "ORDER-1");
  formData.set("paymentId", "payment-1");
  formData.set("orderStatus", "PAID");

  const state = await executeCompleteMockPayment(
    formData,
    async (input) => {
      received = input;
      return paymentResult("SUCCEEDED");
    },
  );

  assert.deepEqual(received, {
    orderNumber: "ORDER-1",
    paymentId: "payment-1",
  });
  assert.equal(state.status, "paid");
  assert.equal(state.failureReason, null);
});

test("fails payment with a server-defined safe failure code", async () => {
  let received: {
    orderNumber: string;
    paymentId: string;
    failureCode: PaymentFailureCode;
  } | undefined;
  const formData = new FormData();
  formData.set("orderNumber", "ORDER-1");
  formData.set("paymentId", "payment-1");
  formData.set("failureCode", "UNTRUSTED_CLIENT_CODE");

  const state = await executeFailMockPayment(
    formData,
    async (input) => {
      received = input;
      return paymentResult("FAILED", "模拟支付被用户拒绝");
    },
  );

  assert.deepEqual(received, {
    orderNumber: "ORDER-1",
    paymentId: "payment-1",
    failureCode: "MOCK_USER_DECLINED",
  });
  assert.equal(state.status, "failed");
  assert.equal(state.failureReason, "模拟支付被用户拒绝");
});

test("maps expired payment errors to a stable user message", async () => {
  const formData = new FormData();
  formData.set("orderNumber", "ORDER-1");
  formData.set("idempotencyKey", "payment-attempt-1");

  const state = await executeStartMockPayment(formData, async () => {
    throw new PaymentError("ORDER_EXPIRED");
  });

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /过期/);
});

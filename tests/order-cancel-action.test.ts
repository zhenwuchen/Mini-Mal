import assert from "node:assert/strict";
import test from "node:test";

import {
  executeCancelOrder,
} from "../src/lib/order-cancel-action";
import { OrderCancelError } from "../src/lib/order-cancel-service";

test("cancels only the server order and exposes restored inventory counts", async () => {
  let receivedOrder = "";
  const formData = new FormData();
  formData.set("orderNumber", " ORDER-1 ");
  formData.set("status", "PAID");
  formData.set("stock", "999");

  const state = await executeCancelOrder(formData, async ({ orderNumber }) => {
    receivedOrder = orderNumber;
    return {
      orderNumber,
      status: "CANCELLED",
      cancelledAt: new Date("2026-11-18T12:10:00.000Z"),
      alreadyCancelled: false,
      restoredItemCount: 2,
      cancelledPaymentCount: 1,
    };
  });

  assert.equal(receivedOrder, "ORDER-1");
  assert.equal(state.status, "success");
  assert.equal(state.restoredItemCount, 2);
  assert.equal(state.cancelledPaymentCount, 1);
});

test("maps cancellation conflicts to actionable feedback", async () => {
  const formData = new FormData();
  formData.set("orderNumber", "ORDER-1");

  const state = await executeCancelOrder(formData, async () => {
    throw new OrderCancelError("SUCCESSFUL_PAYMENT_EXISTS");
  });

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /成功支付/);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  executeCreateOrder,
} from "../src/lib/checkout-action";
import {
  OrderError,
  type CreateOrderInput,
} from "../src/lib/order-service";

function checkoutForm(): FormData {
  const formData = new FormData();
  formData.set("addressId", " address-1 ");
  formData.set("checkoutKey", " checkout-key-1 ");
  formData.set("totalAmount", "1");
  formData.set("price", "1");
  formData.set("stock", "999");
  formData.set("userId", "another-user");
  formData.set("status", "PAID");
  return formData;
}

test("submits only the address and stable checkout key to order creation", async () => {
  let received: CreateOrderInput | undefined;

  const state = await executeCreateOrder(
    checkoutForm(),
    async (input) => {
      received = input;
      return { orderNumber: "ORDER-1" };
    },
  );

  assert.deepEqual(received, {
    addressId: "address-1",
    checkoutKey: "checkout-key-1",
  });
  assert.deepEqual(state, {
    status: "success",
    message: "订单已创建。",
    orderNumber: "ORDER-1",
  });
});

test("shows a stock error without creating a client-calculated total", async () => {
  const state = await executeCreateOrder(checkoutForm(), async () => {
    throw new OrderError("INSUFFICIENT_STOCK");
  });

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /库存不足/);
  assert.equal("totalAmount" in state, false);
});

test("rejects malformed checkout identifiers before calling the service", async () => {
  let calls = 0;
  const formData = new FormData();
  formData.set("addressId", "../address");
  formData.set("checkoutKey", "valid-key");

  const state = await executeCreateOrder(formData, async () => {
    calls += 1;
    return { orderNumber: "never" };
  });

  assert.equal(calls, 0);
  assert.equal(state.status, "error");
});

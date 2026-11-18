"use server";

import { redirect } from "next/navigation";

import { createOrder } from "@/lib/order";
import {
  executeCreateOrder,
  type CheckoutActionState,
} from "@/lib/checkout-action";

export async function checkoutAction(
  _previousState: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const state = await executeCreateOrder(formData, createOrder);

  if (state.status === "success" && state.orderNumber) {
    redirect(
      `/account/orders/${encodeURIComponent(state.orderNumber)}?created=1`,
    );
  }

  return state;
}

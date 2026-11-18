"use server";

import { redirect } from "next/navigation";

import { cancelOrder } from "@/lib/order-cancel";
import {
  executeCancelOrder,
  type OrderCancelActionState,
} from "@/lib/order-cancel-action";

export async function cancelOrderAction(
  _previousState: OrderCancelActionState,
  formData: FormData,
): Promise<OrderCancelActionState> {
  const state = await executeCancelOrder(formData, cancelOrder);

  if (state.status === "success" && state.orderNumber) {
    redirect(
      `/account/orders/${encodeURIComponent(state.orderNumber)}?cancelled=1`,
    );
  }

  return state;
}

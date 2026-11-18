"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import {
  completeMockPayment,
  failMockPayment,
  startMockPayment,
} from "@/lib/payment";
import {
  executeCompleteMockPayment,
  executeFailMockPayment,
  executeStartMockPayment,
  type PaymentActionState,
} from "@/lib/payment-action";

export async function startPaymentAction(
  _previousState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const state = await executeStartMockPayment(
    formData,
    startMockPayment,
  );

  if (state.status === "pending") {
    refresh();
  }

  return state;
}

export async function completePaymentAction(
  _previousState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const state = await executeCompleteMockPayment(
    formData,
    completeMockPayment,
  );

  if (state.status === "paid" && state.orderNumber) {
    redirect(
      `/account/orders/${encodeURIComponent(state.orderNumber)}/payment-result?attempt=success`,
    );
  }

  return state;
}

export async function failPaymentAction(
  _previousState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const state = await executeFailMockPayment(
    formData,
    failMockPayment,
  );

  if (state.status === "failed" && state.orderNumber) {
    redirect(
      `/account/orders/${encodeURIComponent(state.orderNumber)}/payment-result?attempt=failed`,
    );
  }

  return state;
}

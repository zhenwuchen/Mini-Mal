import "server-only";

import { getCurrentUser } from "@/lib/auth-session";
import {
  createPaymentService,
} from "@/lib/payment-service";
import { prisma } from "@/lib/prisma";

const paymentService = createPaymentService({
  prisma,
  getCurrentUserId: async () => {
    const user = await getCurrentUser();
    return user?.id ?? null;
  },
});

export const startMockPayment =
  paymentService.startMockPayment;
export const completeMockPayment =
  paymentService.completeMockPayment;
export const failMockPayment =
  paymentService.failMockPayment;

export {
  MOCK_PAYMENT_METHOD,
  MOCK_PAYMENT_PROVIDER,
  PAYMENT_FAILURE_CODES,
  PaymentError,
  type CompleteMockPaymentInput,
  type FailMockPaymentInput,
  type MockPaymentResult,
  type PaymentErrorCode,
  type PaymentFailureCode,
  type PaymentOrderSummary,
  type PaymentService,
  type PaymentSummary,
  type StartMockPaymentInput,
} from "@/lib/payment-service";
export {
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
  isPaymentStatus,
  type PaymentStatus,
} from "@/lib/payment-status";

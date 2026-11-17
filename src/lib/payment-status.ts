export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
} as const;

export type PaymentStatus =
  (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

const paymentStatusTransitions: Record<
  PaymentStatus,
  readonly PaymentStatus[]
> = {
  PENDING: [
    PAYMENT_STATUS.SUCCEEDED,
    PAYMENT_STATUS.FAILED,
    PAYMENT_STATUS.CANCELLED,
  ],
  SUCCEEDED: [PAYMENT_STATUS.REFUNDED],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function isPaymentStatus(
  value: unknown,
): value is PaymentStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      paymentStatusTransitions,
      value,
    )
  );
}

export function canTransitionPaymentStatus(
  from: unknown,
  to: unknown,
): boolean {
  return (
    isPaymentStatus(from) &&
    isPaymentStatus(to) &&
    paymentStatusTransitions[from].includes(to)
  );
}

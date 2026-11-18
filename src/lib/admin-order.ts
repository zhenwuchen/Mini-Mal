import {
  isOrderStatus,
  type OrderStatus,
} from "@/lib/order-status";
import {
  isPaymentStatus,
  type PaymentStatus,
} from "@/lib/payment-status";

export type AdminPaymentStatusFilter =
  | PaymentStatus
  | "UNPAID";

export type AdminOrderSearch = {
  q: string;
  status: OrderStatus | undefined;
  paymentStatus: AdminPaymentStatusFilter | undefined;
  page: number;
};

type RawSearchParams = Record<
  string,
  string | string[] | undefined
>;

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function normalizeAdminPaymentStatusFilter(
  value: unknown,
): AdminPaymentStatusFilter | undefined {
  if (value === "UNPAID" || isPaymentStatus(value)) {
    return value;
  }

  return undefined;
}

export function normalizeAdminOrderSearchParams(
  params: RawSearchParams,
): AdminOrderSearch {
  const status = firstValue(params.status);
  const paymentStatus = firstValue(params.paymentStatus);
  const pageValue = Number(firstValue(params.page));

  return {
    q: (firstValue(params.q) ?? "").trim(),
    status: isOrderStatus(status) ? status : undefined,
    paymentStatus:
      normalizeAdminPaymentStatusFilter(paymentStatus),
    page:
      Number.isSafeInteger(pageValue) && pageValue > 0
        ? pageValue
        : 1,
  };
}

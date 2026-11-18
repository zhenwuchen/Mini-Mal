import type { Prisma } from "@prisma/client";

import { normalizeLocalImagePath } from "@/lib/image-path";
import {
  getOrderStatusPresentation,
  isOrderStatus,
  ORDER_STATUS,
  type OrderStatus,
} from "@/lib/order-status";

export {
  getOrderStatusPresentation,
  type OrderStatusPresentation,
  type OrderStatusTone,
} from "@/lib/order-status";

export const ORDER_LIST_DEFAULT_PAGE_SIZE = 6;
export const ORDER_LIST_MAX_PAGE_SIZE = 20;
export const ORDER_LIST_MAX_PAGE = 1_000_000;
export const orderFallbackImage =
  "/images/categories/home-living.jpg";

export type OrderPaymentView = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: Date;
  paidAt: Date | null;
};

type OrderPaymentViewSource = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: Date;
  paidAt: Date | null;
  [key: string]: unknown;
};

const safePaymentFailureReasons: Record<string, string> = {
  MOCK_USER_DECLINED: "模拟支付被用户拒绝",
  MOCK_PAYMENT_TIMEOUT: "模拟支付超时",
  MOCK_PAYMENT_FAILED: "模拟支付失败，请稍后重试",
};

type RawSearchParams = Record<
  string,
  string | string[] | undefined
>;

type PaginationInput = {
  page?: unknown;
  pageSize?: unknown;
};

export type OrderListSearch = {
  page: number;
  pageSize: number;
  status?: OrderStatus;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readPositiveInteger(value: unknown, fallback: number) {
  const candidate =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : fallback;
}

export function normalizeOrderPagination(
  input: PaginationInput = {},
) {
  const page = Math.min(
    readPositiveInteger(input.page, 1),
    ORDER_LIST_MAX_PAGE,
  );
  const pageSize = Math.min(
    readPositiveInteger(
      input.pageSize,
      ORDER_LIST_DEFAULT_PAGE_SIZE,
    ),
    ORDER_LIST_MAX_PAGE_SIZE,
  );

  return { page, pageSize };
}

export function normalizeOrderStatusFilter(
  value: unknown,
): OrderStatus | undefined {
  const candidate =
    typeof value === "string" ? value.trim() : value;

  return isOrderStatus(candidate) ? candidate : undefined;
}

export function normalizeOrderListSearchParams(
  params: RawSearchParams,
): OrderListSearch {
  const pagination = normalizeOrderPagination({
    page: firstValue(params.page),
    pageSize: firstValue(params.pageSize),
  });
  const status = normalizeOrderStatusFilter(
    firstValue(params.status),
  );

  return {
    ...pagination,
    status,
  };
}

export function buildOrderListWhere(
  userId: string,
  status?: OrderStatus,
): Prisma.OrderWhereInput {
  return {
    userId,
    ...(status ? { status } : {}),
  };
}

export function buildOrderListOrderBy():
  Prisma.OrderOrderByWithRelationInput[] {
  return [
    { createdAt: "desc" },
    { orderNumber: "asc" },
  ];
}

export function getOrderStatusFilterOptions(): Array<{
  status: OrderStatus | "";
  label: string;
}> {
  return [
    { status: "", label: "全部订单" },
    ...Object.values(ORDER_STATUS).map((status) => ({
      status,
      label: getOrderStatusPresentation(status).label,
    })),
  ];
}

export function getOrderItemImage(
  imageUrl: string | null | undefined,
): string {
  const normalized = imageUrl?.trim();
  return normalizeLocalImagePath(normalized, orderFallbackImage);
}

export function toOrderPaymentView(
  payment: OrderPaymentViewSource,
): OrderPaymentView {
  const failureReason = payment.failureCode
    ? safePaymentFailureReasons[payment.failureCode] ?? null
    : null;

  return {
    id: payment.id,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    failureCode: payment.failureCode,
    failureReason,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
  };
}

export function normalizeOrderNumber(
  orderNumber: unknown,
): string | null {
  if (typeof orderNumber !== "string") return null;

  const normalized = orderNumber.trim();

  if (
    !normalized ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

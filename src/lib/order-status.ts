export const ORDER_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAID: "PAID",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  REFUNDED: "REFUNDED",
} as const;

export const INITIAL_ORDER_STATUS = ORDER_STATUS.PENDING_PAYMENT;
export const ORDER_CURRENCY = "CNY";

export type OrderStatus =
  (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export type OrderStatusTone =
  | "attention"
  | "progress"
  | "success"
  | "neutral";

export type OrderStatusPresentation = {
  label: string;
  tone: OrderStatusTone;
};

const orderStatusPresentations: Record<
  OrderStatus,
  OrderStatusPresentation
> = {
  PENDING_PAYMENT: { label: "待付款", tone: "attention" },
  PAID: { label: "已付款", tone: "progress" },
  PROCESSING: { label: "处理中", tone: "progress" },
  SHIPPED: { label: "已发货", tone: "progress" },
  COMPLETED: { label: "已完成", tone: "success" },
  CANCELLED: { label: "已取消", tone: "neutral" },
  REFUNDED: { label: "已退款", tone: "neutral" },
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      orderStatusPresentations,
      value,
    )
  );
}

export function getOrderStatusPresentation(
  status: string,
): OrderStatusPresentation {
  if (isOrderStatus(status)) {
    return orderStatusPresentations[status];
  }

  return {
    label: "状态未知",
    tone: "neutral",
  };
}

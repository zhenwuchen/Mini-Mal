import {
  OrderCancelError,
  type CancelOrderInput,
} from "@/lib/order-cancel-service";

export type OrderCancelActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  orderNumber?: string;
  restoredItemCount?: number;
  cancelledPaymentCount?: number;
};

export const initialOrderCancelActionState: OrderCancelActionState = {
  status: "idle",
};

type CancelOrder = (
  input: CancelOrderInput,
) => Promise<{
  orderNumber: string;
  status: "CANCELLED";
  cancelledAt: Date | null;
  alreadyCancelled: boolean;
  restoredItemCount: number;
  cancelledPaymentCount: number;
}>;

const orderNumberPattern = /^[A-Za-z0-9_-]{1,128}$/;

export async function executeCancelOrder(
  formData: FormData,
  cancelOrder: CancelOrder,
): Promise<OrderCancelActionState> {
  const value = formData.get("orderNumber");
  const orderNumber =
    typeof value === "string" ? value.trim() : "";

  if (!orderNumberPattern.test(orderNumber)) {
    return {
      status: "error",
      message: "订单信息无效，请刷新页面后重试。",
    };
  }

  try {
    const result = await cancelOrder({ orderNumber });

    return {
      status: "success",
      message: result.alreadyCancelled
        ? "订单已经取消，库存不会重复恢复。"
        : "订单已取消，库存已恢复。",
      orderNumber: result.orderNumber,
      restoredItemCount: result.restoredItemCount,
      cancelledPaymentCount: result.cancelledPaymentCount,
    };
  } catch (error) {
    if (error instanceof OrderCancelError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: "订单暂时无法取消，请稍后重试。",
    };
  }
}

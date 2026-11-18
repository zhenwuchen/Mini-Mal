import {
  OrderError,
  type CreateOrderInput,
} from "@/lib/order-service";

export type CheckoutActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  orderNumber?: string;
};

export const initialCheckoutActionState: CheckoutActionState = {
  status: "idle",
};

type CreateOrder = (
  input: CreateOrderInput,
) => Promise<{ orderNumber: string }>;

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/;

function readIdentifier(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  const identifier =
    typeof value === "string" ? value.trim() : "";

  return identifierPattern.test(identifier) ? identifier : null;
}

export async function executeCreateOrder(
  formData: FormData,
  createOrder: CreateOrder,
): Promise<CheckoutActionState> {
  const addressId = readIdentifier(formData, "addressId");
  const checkoutKey = readIdentifier(formData, "checkoutKey");

  if (!addressId) {
    return {
      status: "error",
      message: "请选择有效的收货地址后重新提交。",
    };
  }

  if (!checkoutKey) {
    return {
      status: "error",
      message: "结算请求已失效，请刷新页面后重试。",
    };
  }

  try {
    const order = await createOrder({ addressId, checkoutKey });

    return {
      status: "success",
      message: "订单已创建。",
      orderNumber: order.orderNumber,
    };
  } catch (error) {
    if (error instanceof OrderError) {
      return {
        status: "error",
        message: error.message,
      };
    }

    return {
      status: "error",
      message: "订单暂时无法创建，请稍后重试。",
    };
  }
}

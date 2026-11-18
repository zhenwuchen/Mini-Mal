import {
  PAYMENT_FAILURE_CODES,
  PaymentError,
  type CompleteMockPaymentInput,
  type FailMockPaymentInput,
  type StartMockPaymentInput,
} from "@/lib/payment-service";

type PaymentActionStatus =
  | "idle"
  | "pending"
  | "paid"
  | "failed"
  | "error";

export type PaymentActionState = {
  status: PaymentActionStatus;
  message?: string;
  orderNumber?: string;
  paymentId?: string;
  totalAmount?: number;
  currency?: string;
  failureCode?: string | null;
  failureReason?: string | null;
};

export const initialPaymentActionState: PaymentActionState = {
  status: "idle",
};

type PaymentResultView = {
  order: {
    orderNumber: string;
    status: string;
    totalAmount: number;
    currency: string;
    expiresAt: Date | null;
    paidAt: Date | null;
  };
  payment: {
    id: string;
    status: string;
    failureCode: string | null;
    failureReason: string | null;
    paidAt: Date | null;
  };
};

type StartMockPayment = (
  input: StartMockPaymentInput,
) => Promise<PaymentResultView>;
type CompleteMockPayment = (
  input: CompleteMockPaymentInput,
) => Promise<PaymentResultView>;
type FailMockPayment = (
  input: FailMockPaymentInput,
) => Promise<PaymentResultView>;

const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/;

function readIdentifier(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  const identifier =
    typeof value === "string" ? value.trim() : "";

  return identifierPattern.test(identifier) ? identifier : null;
}

function invalidIdentifierState(message: string): PaymentActionState {
  return { status: "error", message };
}

function toPaymentErrorState(error: unknown): PaymentActionState {
  if (error instanceof PaymentError) {
    return {
      status: "error",
      message: error.message,
    };
  }

  return {
    status: "error",
    message: "支付暂时无法处理，请稍后重试。",
  };
}

function startResult(
  result: PaymentResultView,
): PaymentActionState {
  return {
    status: "pending",
    message: "支付请求已创建，请确认本次模拟支付。",
    orderNumber: result.order.orderNumber,
    paymentId: result.payment.id,
    totalAmount: result.order.totalAmount,
    currency: result.order.currency,
    failureCode: result.payment.failureCode,
    failureReason: result.payment.failureReason,
  };
}

export async function executeStartMockPayment(
  formData: FormData,
  startMockPayment: StartMockPayment,
): Promise<PaymentActionState> {
  const orderNumber = readIdentifier(formData, "orderNumber");
  const idempotencyKey = readIdentifier(
    formData,
    "idempotencyKey",
  );

  if (!orderNumber) {
    return invalidIdentifierState("订单信息无效，请刷新页面后重试。");
  }

  if (!idempotencyKey) {
    return invalidIdentifierState("支付请求标识无效，请刷新页面后重试。");
  }

  try {
    return startResult(
      await startMockPayment({ orderNumber, idempotencyKey }),
    );
  } catch (error) {
    return toPaymentErrorState(error);
  }
}

export async function executeCompleteMockPayment(
  formData: FormData,
  completeMockPayment: CompleteMockPayment,
): Promise<PaymentActionState> {
  const orderNumber = readIdentifier(formData, "orderNumber");
  const paymentId = readIdentifier(formData, "paymentId");

  if (!orderNumber) {
    return invalidIdentifierState("订单信息无效，请刷新页面后重试。");
  }

  if (!paymentId) {
    return invalidIdentifierState("支付记录无效，请重新发起支付。");
  }

  try {
    const result = await completeMockPayment({
      orderNumber,
      paymentId,
    });

    return {
      status: "paid",
      message: "支付已完成。",
      orderNumber: result.order.orderNumber,
      paymentId: result.payment.id,
      totalAmount: result.order.totalAmount,
      currency: result.order.currency,
      failureCode: result.payment.failureCode,
      failureReason: result.payment.failureReason,
    };
  } catch (error) {
    return toPaymentErrorState(error);
  }
}

export async function executeFailMockPayment(
  formData: FormData,
  failMockPayment: FailMockPayment,
): Promise<PaymentActionState> {
  const orderNumber = readIdentifier(formData, "orderNumber");
  const paymentId = readIdentifier(formData, "paymentId");

  if (!orderNumber) {
    return invalidIdentifierState("订单信息无效，请刷新页面后重试。");
  }

  if (!paymentId) {
    return invalidIdentifierState("支付记录无效，请重新发起支付。");
  }

  try {
    const result = await failMockPayment({
      orderNumber,
      paymentId,
      failureCode: PAYMENT_FAILURE_CODES.MOCK_USER_DECLINED,
    });

    return {
      status: "failed",
      message: "本次模拟支付未完成，可以重新尝试。",
      orderNumber: result.order.orderNumber,
      paymentId: result.payment.id,
      totalAmount: result.order.totalAmount,
      currency: result.order.currency,
      failureCode: result.payment.failureCode,
      failureReason: result.payment.failureReason,
    };
  } catch (error) {
    return toPaymentErrorState(error);
  }
}

import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  cancelPendingPaymentsForOrder,
  findSuccessfulPaymentsForOrder,
} from "@/lib/payment-service";
import {
  ORDER_STATUS,
  type OrderStatus,
} from "@/lib/order-status";

export type OrderCancelErrorCode =
  | "UNAUTHENTICATED"
  | "ORDER_NOT_FOUND"
  | "ORDER_FORBIDDEN"
  | "ORDER_NOT_CANCELLABLE"
  | "ORDER_ALREADY_CANCELLED"
  | "SUCCESSFUL_PAYMENT_EXISTS"
  | "ORDER_CANCEL_BUSY"
  | "STOCK_RESTORE_FAILED"
  | "ORDER_CANCEL_FAILED";

const orderCancelErrorMessages: Record<
  OrderCancelErrorCode,
  string
> = {
  UNAUTHENTICATED: "请先登录后再取消订单",
  ORDER_NOT_FOUND: "订单不存在",
  ORDER_FORBIDDEN: "无权取消该订单",
  ORDER_NOT_CANCELLABLE: "当前订单不可取消",
  ORDER_ALREADY_CANCELLED: "订单已经取消",
  SUCCESSFUL_PAYMENT_EXISTS: "订单已存在成功支付，不能直接取消",
  ORDER_CANCEL_BUSY: "订单取消繁忙，请稍后重试",
  STOCK_RESTORE_FAILED: "订单库存恢复失败，请稍后重试",
  ORDER_CANCEL_FAILED: "订单取消失败，请稍后重试",
};

export class OrderCancelError extends Error {
  readonly code: OrderCancelErrorCode;

  constructor(code: OrderCancelErrorCode) {
    super(orderCancelErrorMessages[code]);
    this.name = "OrderCancelError";
    this.code = code;
  }
}

export type CancelOrderInput = {
  orderNumber: string;
};

export type OrderCancelOutcome =
  | "CANCELLED"
  | "ALREADY_CANCELLED";

export type OrderCancelResult = {
  orderNumber: string;
  status: Extract<OrderStatus, "CANCELLED">;
  cancelledAt: Date | null;
  outcome: OrderCancelOutcome;
  alreadyCancelled: boolean;
  restoredItemCount: number;
  cancelledPaymentCount: number;
};

export type OrderCancelService = {
  cancelOrder(input: CancelOrderInput): Promise<OrderCancelResult>;
  cancelOrderAsAdmin(
    input: CancelOrderInput,
  ): Promise<OrderCancelResult>;
};

type OrderCancelServiceDependencies = {
  prisma: PrismaClient;
  getCurrentUserId: () => Promise<string | null>;
  now?: () => Date;
};

const MAX_WRITE_ATTEMPTS = 5;
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

class RetryableOrderCancelWriteError extends Error {}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function isRetryableWriteError(error: unknown): boolean {
  if (
    error instanceof RetryableOrderCancelWriteError ||
    isPrismaErrorCode(error, "P2028") ||
    isPrismaErrorCode(error, "P2034")
  ) {
    return true;
  }

  return (
    error instanceof Error &&
    (error.message.includes("database is locked") ||
      error.message.includes("database table is locked") ||
      error.message.includes("Transaction API error") ||
      error.message.includes("Transaction already closed") ||
      error.message.includes("Transaction is not found"))
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeOrderNumber(value: unknown): string {
  const orderNumber =
    typeof value === "string" ? value.trim() : "";

  if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
    throw new OrderCancelError("ORDER_NOT_FOUND");
  }

  return orderNumber;
}

async function restoreOrderItems(
  transaction: Prisma.TransactionClient,
  orderId: string,
): Promise<number> {
  const items = await transaction.orderItem.findMany({
    where: { orderId },
    select: {
      productId: true,
      quantity: true,
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
  let restoredItemCount = 0;

  for (const item of items) {
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1
    ) {
      throw new OrderCancelError("STOCK_RESTORE_FAILED");
    }

    if (item.productId === null) {
      continue;
    }

    try {
      const updated = await transaction.product.updateMany({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
        },
      });

      if (updated.count !== 1) {
        throw new OrderCancelError("STOCK_RESTORE_FAILED");
      }
    } catch (error) {
      if (error instanceof OrderCancelError) {
        throw error;
      }

      if (isRetryableWriteError(error)) {
        throw error;
      }

      throw new OrderCancelError("STOCK_RESTORE_FAILED");
    }

    restoredItemCount += 1;
  }

  return restoredItemCount;
}

function toAlreadyCancelledResult(order: {
  orderNumber: string;
  cancelledAt: Date | null;
}): OrderCancelResult {
  return {
    orderNumber: order.orderNumber,
    status: ORDER_STATUS.CANCELLED,
    cancelledAt: order.cancelledAt,
    outcome: "ALREADY_CANCELLED",
    alreadyCancelled: true,
    restoredItemCount: 0,
    cancelledPaymentCount: 0,
  };
}

export function createOrderCancelService({
  prisma,
  getCurrentUserId,
  now = () => new Date(),
}: OrderCancelServiceDependencies): OrderCancelService {
  async function requireCurrentUserId(): Promise<string> {
    const userId = await getCurrentUserId();

    if (!userId) {
      throw new OrderCancelError("UNAUTHENTICATED");
    }

    return userId;
  }

  async function runWriteTransaction<T>(
    operation: (
      transaction: Prisma.TransactionClient,
    ) => Promise<T>,
  ): Promise<T> {
    for (
      let attempt = 1;
      attempt <= MAX_WRITE_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await prisma.$transaction(operation, {
          maxWait: 5_000,
          timeout: 10_000,
        });
      } catch (error) {
        if (error instanceof OrderCancelError) {
          throw error;
        }

        if (
          isRetryableWriteError(error) &&
          attempt < MAX_WRITE_ATTEMPTS
        ) {
          await wait(attempt * 25);
          continue;
        }

        if (isRetryableWriteError(error)) {
          throw new OrderCancelError("ORDER_CANCEL_BUSY");
        }

        throw error;
      }
    }

    throw new OrderCancelError("ORDER_CANCEL_BUSY");
  }

  async function cancelByOrderNumber(
    input: CancelOrderInput,
    scopedUserId: string | null,
  ): Promise<OrderCancelResult> {
    try {
      const candidate =
        input && typeof input === "object"
          ? (input as unknown as Record<string, unknown>)
          : {};
      const orderNumber = normalizeOrderNumber(
        candidate.orderNumber,
      );

      return await runWriteTransaction(async (transaction) => {
        const order = await transaction.order.findFirst({
          where: {
            orderNumber,
            ...(scopedUserId ? { userId: scopedUserId } : {}),
          },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            cancelledAt: true,
          },
        });

        if (!order) {
          if (!scopedUserId) {
            throw new OrderCancelError("ORDER_NOT_FOUND");
          }

          const existingOrder = await transaction.order.findUnique({
            where: { orderNumber },
            select: { id: true },
          });

          throw new OrderCancelError(
            existingOrder
              ? "ORDER_FORBIDDEN"
              : "ORDER_NOT_FOUND",
          );
        }

        if (order.status === ORDER_STATUS.CANCELLED) {
          return toAlreadyCancelledResult(order);
        }

        if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
          throw new OrderCancelError("ORDER_NOT_CANCELLABLE");
        }

        const cancelledAt = now();
        const statusUpdate = await transaction.order.updateMany({
          where: {
            id: order.id,
            ...(scopedUserId ? { userId: scopedUserId } : {}),
            status: ORDER_STATUS.PENDING_PAYMENT,
            cancelledAt: null,
          },
          data: {
            status: ORDER_STATUS.CANCELLED,
            cancelledAt,
          },
        });

        if (statusUpdate.count !== 1) {
          const currentOrder = await transaction.order.findFirst({
            where: {
              id: order.id,
              ...(scopedUserId ? { userId: scopedUserId } : {}),
            },
            select: {
              orderNumber: true,
              status: true,
              cancelledAt: true,
            },
          });

          if (!currentOrder) {
            throw new OrderCancelError("ORDER_NOT_FOUND");
          }

          if (currentOrder.status === ORDER_STATUS.CANCELLED) {
            return toAlreadyCancelledResult(currentOrder);
          }

          throw new OrderCancelError("ORDER_NOT_CANCELLABLE");
        }

        const successfulPayments =
          await findSuccessfulPaymentsForOrder(
            transaction,
            order.id,
          );

        if (successfulPayments.length > 0) {
          throw new OrderCancelError(
            "SUCCESSFUL_PAYMENT_EXISTS",
          );
        }

        const cancelledPaymentCount =
          await cancelPendingPaymentsForOrder(
            transaction,
            order.id,
          );
        const restoredItemCount = await restoreOrderItems(
          transaction,
          order.id,
        );

        return {
          orderNumber: order.orderNumber,
          status: ORDER_STATUS.CANCELLED,
          cancelledAt,
          outcome: "CANCELLED" as const,
          alreadyCancelled: false,
          restoredItemCount,
          cancelledPaymentCount,
        };
      });
    } catch (error) {
      if (error instanceof OrderCancelError) {
        throw error;
      }

      if (isRetryableWriteError(error)) {
        throw new OrderCancelError("ORDER_CANCEL_BUSY");
      }

      throw new OrderCancelError("ORDER_CANCEL_FAILED");
    }
  }

  async function cancelOrder(
    input: CancelOrderInput,
  ): Promise<OrderCancelResult> {
    const userId = await requireCurrentUserId();
    return cancelByOrderNumber(input, userId);
  }

  async function cancelOrderAsAdmin(
    input: CancelOrderInput,
  ): Promise<OrderCancelResult> {
    return cancelByOrderNumber(input, null);
  }

  return { cancelOrder, cancelOrderAsAdmin };
}

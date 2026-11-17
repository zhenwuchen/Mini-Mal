import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import { isOrderExpired } from "@/lib/order-policy";
import { ORDER_STATUS } from "@/lib/order-status";
import {
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
  isPaymentStatus,
} from "@/lib/payment-status";

export type PaymentErrorCode =
  | "UNAUTHENTICATED"
  | "ORDER_NOT_FOUND"
  | "ORDER_NOT_PAYABLE"
  | "ORDER_EXPIRED"
  | "PAYMENT_NOT_FOUND"
  | "PAYMENT_NOT_PENDING"
  | "PAYMENT_PROVIDER_MISMATCH"
  | "PAYMENT_METHOD_MISMATCH"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_CURRENCY_MISMATCH"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_FAILURE_CODE"
  | "PAYMENT_ALREADY_COMPLETED"
  | "PAYMENT_STATE_CONFLICT"
  | "PAYMENT_BUSY"
  | "PAYMENT_OPERATION_FAILED";

const paymentErrorMessages: Record<PaymentErrorCode, string> = {
  UNAUTHENTICATED: "请先登录后再进行支付",
  ORDER_NOT_FOUND: "订单不存在",
  ORDER_NOT_PAYABLE: "当前订单不可支付",
  ORDER_EXPIRED: "订单支付时间已过期",
  PAYMENT_NOT_FOUND: "支付记录不存在",
  PAYMENT_NOT_PENDING: "当前支付记录不可操作",
  PAYMENT_PROVIDER_MISMATCH: "支付渠道不匹配",
  PAYMENT_METHOD_MISMATCH: "支付方式不匹配",
  PAYMENT_AMOUNT_MISMATCH: "支付金额与订单不一致",
  PAYMENT_CURRENCY_MISMATCH: "支付币种与订单不一致",
  INVALID_IDEMPOTENCY_KEY: "支付请求标识无效，请刷新页面后重试",
  INVALID_FAILURE_CODE: "模拟支付失败原因无效",
  PAYMENT_ALREADY_COMPLETED: "订单已完成支付",
  PAYMENT_STATE_CONFLICT: "支付状态冲突，请刷新后重试",
  PAYMENT_BUSY: "支付处理繁忙，请稍后重试",
  PAYMENT_OPERATION_FAILED: "支付处理失败，请稍后重试",
};

export class PaymentError extends Error {
  readonly code: PaymentErrorCode;

  constructor(code: PaymentErrorCode) {
    super(paymentErrorMessages[code]);
    this.name = "PaymentError";
    this.code = code;
  }
}

export const MOCK_PAYMENT_PROVIDER = "MOCK";
export const MOCK_PAYMENT_METHOD = "MOCK";

export const PAYMENT_FAILURE_CODES = {
  MOCK_USER_DECLINED: "MOCK_USER_DECLINED",
  MOCK_PAYMENT_TIMEOUT: "MOCK_PAYMENT_TIMEOUT",
  MOCK_PAYMENT_FAILED: "MOCK_PAYMENT_FAILED",
} as const;

export type PaymentFailureCode =
  (typeof PAYMENT_FAILURE_CODES)[keyof typeof PAYMENT_FAILURE_CODES];

const paymentFailureReasons: Record<PaymentFailureCode, string> = {
  MOCK_USER_DECLINED: "模拟支付被用户拒绝",
  MOCK_PAYMENT_TIMEOUT: "模拟支付超时",
  MOCK_PAYMENT_FAILED: "模拟支付失败，请稍后重试",
};

export type StartMockPaymentInput = {
  orderNumber: string;
  idempotencyKey: string;
};

export type CompleteMockPaymentInput = {
  orderNumber: string;
  paymentId: string;
};

export type FailMockPaymentInput = {
  orderNumber: string;
  paymentId: string;
  failureCode: PaymentFailureCode;
};

const orderPaymentSelect = {
  id: true,
  orderNumber: true,
  status: true,
  totalAmount: true,
  currency: true,
  expiresAt: true,
  paidAt: true,
} satisfies Prisma.OrderSelect;

const paymentSummarySelect = {
  id: true,
  orderId: true,
  amount: true,
  currency: true,
  status: true,
  provider: true,
  method: true,
  failureCode: true,
  failureReason: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PaymentSelect;

export type PaymentOrderSummary = Prisma.OrderGetPayload<{
  select: typeof orderPaymentSelect;
}>;

export type PaymentSummary = Prisma.PaymentGetPayload<{
  select: typeof paymentSummarySelect;
}>;

export type MockPaymentResult = {
  order: PaymentOrderSummary;
  payment: PaymentSummary;
};

export type PaymentService = {
  startMockPayment(
    input: StartMockPaymentInput,
  ): Promise<MockPaymentResult>;
  completeMockPayment(
    input: CompleteMockPaymentInput,
  ): Promise<MockPaymentResult>;
  failMockPayment(
    input: FailMockPaymentInput,
  ): Promise<MockPaymentResult>;
};

type PaymentServiceDependencies = {
  prisma: PrismaClient;
  getCurrentUserId: () => Promise<string | null>;
  now?: () => Date;
};

type NormalizedPaymentIdentity = {
  orderNumber: string;
};

type NormalizedCompleteInput = NormalizedPaymentIdentity & {
  paymentId: string;
};

type NormalizedFailInput = NormalizedCompleteInput & {
  failureCode: PaymentFailureCode;
};

type OrderClient = Pick<Prisma.TransactionClient, "order">;
type PaymentClient = Pick<Prisma.TransactionClient, "payment">;

const MAX_WRITE_ATTEMPTS = 5;
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

class RetryablePaymentWriteError extends Error {}

function isPrismaErrorCode(
  error: unknown,
  code: string,
): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function isRetryableWriteError(error: unknown): boolean {
  if (
    error instanceof RetryablePaymentWriteError ||
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
    throw new PaymentError("ORDER_NOT_FOUND");
  }

  return orderNumber;
}

function normalizePaymentId(value: unknown): string {
  const paymentId =
    typeof value === "string" ? value.trim() : "";

  if (!RESOURCE_ID_PATTERN.test(paymentId)) {
    throw new PaymentError("PAYMENT_NOT_FOUND");
  }

  return paymentId;
}

function normalizeIdempotencyKey(value: unknown): string {
  const idempotencyKey =
    typeof value === "string" ? value.trim() : "";

  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new PaymentError("INVALID_IDEMPOTENCY_KEY");
  }

  return idempotencyKey;
}

function normalizeCompleteInput(
  input: CompleteMockPaymentInput,
): NormalizedCompleteInput {
  const candidate =
    input && typeof input === "object"
      ? (input as unknown as Record<string, unknown>)
      : {};

  return {
    orderNumber: normalizeOrderNumber(candidate.orderNumber),
    paymentId: normalizePaymentId(candidate.paymentId),
  };
}

function isPaymentFailureCode(
  value: unknown,
): value is PaymentFailureCode {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      paymentFailureReasons,
      value,
    )
  );
}

function normalizeFailInput(
  input: FailMockPaymentInput,
): NormalizedFailInput {
  const normalized = normalizeCompleteInput(input);
  const failureCode = (
    input as unknown as Record<string, unknown>
  ).failureCode;

  if (!isPaymentFailureCode(failureCode)) {
    throw new PaymentError("INVALID_FAILURE_CODE");
  }

  return {
    ...normalized,
    failureCode,
  };
}

function assertMockPaymentMatchesOrder(
  order: PaymentOrderSummary,
  payment: PaymentSummary,
) {
  if (payment.provider !== MOCK_PAYMENT_PROVIDER) {
    throw new PaymentError("PAYMENT_PROVIDER_MISMATCH");
  }

  if (payment.method !== MOCK_PAYMENT_METHOD) {
    throw new PaymentError("PAYMENT_METHOD_MISMATCH");
  }

  if (payment.amount !== order.totalAmount) {
    throw new PaymentError("PAYMENT_AMOUNT_MISMATCH");
  }

  if (payment.currency !== order.currency) {
    throw new PaymentError("PAYMENT_CURRENCY_MISMATCH");
  }
}

function toResult(
  order: PaymentOrderSummary,
  payment: PaymentSummary,
): MockPaymentResult {
  return { order, payment };
}

async function findOwnedOrder(
  client: OrderClient,
  userId: string,
  orderNumber: string,
): Promise<PaymentOrderSummary | null> {
  return client.order.findFirst({
    where: {
      orderNumber,
      userId,
    },
    select: orderPaymentSelect,
  });
}

async function findOrderPayment(
  client: PaymentClient,
  orderId: string,
  paymentId: string,
): Promise<PaymentSummary | null> {
  return client.payment.findFirst({
    where: {
      id: paymentId,
      orderId,
    },
    select: paymentSummarySelect,
  });
}

async function findIdempotentMockPayment(
  client: PaymentClient,
  idempotencyKey: string,
): Promise<PaymentSummary | null> {
  return client.payment.findFirst({
    where: {
      provider: MOCK_PAYMENT_PROVIDER,
      idempotencyKey,
    },
    select: paymentSummarySelect,
  });
}

export async function findSuccessfulPaymentsForOrder(
  client: PaymentClient,
  orderId: string,
): Promise<PaymentSummary[]> {
  return client.payment.findMany({
    where: {
      orderId,
      status: PAYMENT_STATUS.SUCCEEDED,
    },
    select: paymentSummarySelect,
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  });
}

export async function cancelPendingPaymentsForOrder(
  client: PaymentClient,
  orderId: string,
  scope: {
    provider?: string;
    method?: string;
  } = {},
): Promise<number> {
  if (
    !canTransitionPaymentStatus(
      PAYMENT_STATUS.PENDING,
      PAYMENT_STATUS.CANCELLED,
    )
  ) {
    throw new PaymentError("PAYMENT_STATE_CONFLICT");
  }

  const updated = await client.payment.updateMany({
    where: {
      orderId,
      status: PAYMENT_STATUS.PENDING,
      ...(scope.provider ? { provider: scope.provider } : {}),
      ...(scope.method ? { method: scope.method } : {}),
    },
    data: {
      status: PAYMENT_STATUS.CANCELLED,
    },
  });

  return updated.count;
}

export function createPaymentService({
  prisma,
  getCurrentUserId,
  now = () => new Date(),
}: PaymentServiceDependencies): PaymentService {
  async function requireCurrentUserId(): Promise<string> {
    const userId = await getCurrentUserId();

    if (!userId) {
      throw new PaymentError("UNAUTHENTICATED");
    }

    return userId;
  }

  async function runWriteTransaction<T>(
    operation: (
      transaction: Prisma.TransactionClient,
    ) => Promise<T>,
    recoverUniqueConflict?: () => Promise<T>,
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
        if (
          recoverUniqueConflict &&
          isPrismaErrorCode(error, "P2002")
        ) {
          return recoverUniqueConflict();
        }

        if (isRetryableWriteError(error)) {
          if (attempt < MAX_WRITE_ATTEMPTS) {
            await wait(attempt * 25);
            continue;
          }

          throw new PaymentError("PAYMENT_BUSY");
        }

        if (error instanceof PaymentError) {
          throw error;
        }

        throw new PaymentError("PAYMENT_OPERATION_FAILED");
      }
    }

    throw new PaymentError("PAYMENT_BUSY");
  }

  async function withSafeErrorBoundary<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      if (isRetryableWriteError(error)) {
        throw new PaymentError("PAYMENT_BUSY");
      }

      throw new PaymentError("PAYMENT_OPERATION_FAILED");
    }
  }

  async function startMockPayment(
    input: StartMockPaymentInput,
  ): Promise<MockPaymentResult> {
    return withSafeErrorBoundary(async () => {
      const userId = await requireCurrentUserId();
      const candidate =
        input && typeof input === "object"
          ? (input as unknown as Record<string, unknown>)
          : {};
      const orderNumber = normalizeOrderNumber(candidate.orderNumber);
      const idempotencyKey = normalizeIdempotencyKey(
        candidate.idempotencyKey,
      );

      async function recoverUniqueConflict() {
        const racedOrder = await findOwnedOrder(
          prisma,
          userId,
          orderNumber,
        );

        if (!racedOrder) {
          throw new PaymentError("ORDER_NOT_FOUND");
        }

        const racedPayment = await findIdempotentMockPayment(
          prisma,
          idempotencyKey,
        );

        if (
          !racedPayment ||
          racedPayment.orderId !== racedOrder.id
        ) {
          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        assertMockPaymentMatchesOrder(racedOrder, racedPayment);

        if (!isPaymentStatus(racedPayment.status)) {
          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        return toResult(racedOrder, racedPayment);
      }

      return runWriteTransaction(async (transaction) => {
        const order = await findOwnedOrder(
          transaction,
          userId,
          orderNumber,
        );

        if (!order) {
          throw new PaymentError("ORDER_NOT_FOUND");
        }

        const existing = await findIdempotentMockPayment(
          transaction,
          idempotencyKey,
        );

        if (existing) {
          if (existing.orderId !== order.id) {
            throw new PaymentError("PAYMENT_STATE_CONFLICT");
          }

          assertMockPaymentMatchesOrder(order, existing);

          if (!isPaymentStatus(existing.status)) {
            throw new PaymentError("PAYMENT_STATE_CONFLICT");
          }

          return toResult(order, existing);
        }

        if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
          throw new PaymentError("ORDER_NOT_PAYABLE");
        }

        if (isOrderExpired(order.expiresAt, now())) {
          throw new PaymentError("ORDER_EXPIRED");
        }

        const payment = await transaction.payment.create({
          data: {
            orderId: order.id,
            amount: order.totalAmount,
            currency: order.currency,
            status: PAYMENT_STATUS.PENDING,
            provider: MOCK_PAYMENT_PROVIDER,
            method: MOCK_PAYMENT_METHOD,
            idempotencyKey,
          },
          select: paymentSummarySelect,
        });
        const confirmedOrder = await findOwnedOrder(
          transaction,
          userId,
          orderNumber,
        );

        if (!confirmedOrder) {
          throw new PaymentError("ORDER_NOT_FOUND");
        }

        if (
          confirmedOrder.status !==
          ORDER_STATUS.PENDING_PAYMENT
        ) {
          throw new PaymentError("ORDER_NOT_PAYABLE");
        }

        if (isOrderExpired(confirmedOrder.expiresAt, now())) {
          throw new PaymentError("ORDER_EXPIRED");
        }

        assertMockPaymentMatchesOrder(confirmedOrder, payment);

        return toResult(confirmedOrder, payment);
      }, recoverUniqueConflict);
    });
  }

  async function completeMockPayment(
    input: CompleteMockPaymentInput,
  ): Promise<MockPaymentResult> {
    return withSafeErrorBoundary(async () => {
      const userId = await requireCurrentUserId();
      const normalized = normalizeCompleteInput(input);

      // Preserve the application-clock observation. The database is the
      // authority for the deadline decision inside the transaction below.
      now();

      return runWriteTransaction(async (transaction) => {
        const order = await findOwnedOrder(
          transaction,
          userId,
          normalized.orderNumber,
        );

        if (!order) {
          throw new PaymentError("ORDER_NOT_FOUND");
        }

        const payment = await findOrderPayment(
          transaction,
          order.id,
          normalized.paymentId,
        );

        if (!payment) {
          throw new PaymentError("PAYMENT_NOT_FOUND");
        }

        assertMockPaymentMatchesOrder(order, payment);

        if (!isPaymentStatus(payment.status)) {
          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        const successfulPayments =
          await findSuccessfulPaymentsForOrder(transaction, order.id);
        const successfulPaymentCount = successfulPayments.length;

        if (payment.status === PAYMENT_STATUS.SUCCEEDED) {
          if (
            order.status === ORDER_STATUS.PAID &&
            successfulPaymentCount === 1
          ) {
            return toResult(order, payment);
          }

          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        if (order.status === ORDER_STATUS.PAID) {
          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
          throw new PaymentError("ORDER_NOT_PAYABLE");
        }

        if (payment.status !== PAYMENT_STATUS.PENDING) {
          throw new PaymentError("PAYMENT_NOT_PENDING");
        }

        if (successfulPaymentCount > 0) {
          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        if (
          !canTransitionPaymentStatus(
            payment.status,
            PAYMENT_STATUS.SUCCEEDED,
          )
        ) {
          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        const updatedOrders = await transaction.$queryRaw<
          Array<{ paidAt: Date }>
        >(Prisma.sql`
          WITH "db_clock"("nowMs") AS (
            SELECT CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER)
          )
          UPDATE "Order"
          SET
            "status" = ${ORDER_STATUS.PAID},
            "paidAt" = (SELECT "nowMs" FROM "db_clock"),
            "updatedAt" = (SELECT "nowMs" FROM "db_clock")
          WHERE
            "id" = ${order.id}
            AND "userId" = ${userId}
            AND "status" = ${ORDER_STATUS.PENDING_PAYMENT}
            AND (
              "expiresAt" IS NULL
              OR "expiresAt" > (SELECT "nowMs" FROM "db_clock")
            )
          RETURNING "paidAt"
        `);

        if (updatedOrders.length !== 1) {
          const [current] = await transaction.$queryRaw<
            Array<{
              expiresAt: Date | null;
              nowMs: bigint;
            }>
          >(Prisma.sql`
            SELECT
              "expiresAt",
              CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER) AS "nowMs"
            FROM "Order"
            WHERE
              "id" = ${order.id}
              AND "userId" = ${userId}
            LIMIT 1
          `);

          if (
            current?.expiresAt &&
            current.nowMs >= BigInt(current.expiresAt.getTime())
          ) {
            throw new PaymentError("ORDER_EXPIRED");
          }

          throw new RetryablePaymentWriteError(
            "Order state changed while completing payment",
          );
        }

        const paidAt = updatedOrders[0].paidAt;
        const updatedPayment = await transaction.payment.updateMany({
          where: {
            id: payment.id,
            orderId: order.id,
            status: PAYMENT_STATUS.PENDING,
            provider: MOCK_PAYMENT_PROVIDER,
            method: MOCK_PAYMENT_METHOD,
            amount: order.totalAmount,
            currency: order.currency,
          },
          data: {
            status: PAYMENT_STATUS.SUCCEEDED,
            paidAt,
            failureCode: null,
            failureReason: null,
          },
        });

        if (updatedPayment.count !== 1) {
          throw new RetryablePaymentWriteError(
            "Payment state changed while completing payment",
          );
        }

        await cancelPendingPaymentsForOrder(transaction, order.id, {
          provider: MOCK_PAYMENT_PROVIDER,
          method: MOCK_PAYMENT_METHOD,
        });

        const completedOrder = await findOwnedOrder(
          transaction,
          userId,
          normalized.orderNumber,
        );
        const completedPayment = await findOrderPayment(
          transaction,
          order.id,
          payment.id,
        );

        if (!completedOrder || !completedPayment) {
          throw new RetryablePaymentWriteError(
            "Completed payment cannot be read",
          );
        }

        return toResult(completedOrder, completedPayment);
      });
    });
  }

  async function failMockPayment(
    input: FailMockPaymentInput,
  ): Promise<MockPaymentResult> {
    return withSafeErrorBoundary(async () => {
      const userId = await requireCurrentUserId();
      const normalized = normalizeFailInput(input);

      return runWriteTransaction(async (transaction) => {
        const order = await findOwnedOrder(
          transaction,
          userId,
          normalized.orderNumber,
        );

        if (!order) {
          throw new PaymentError("ORDER_NOT_FOUND");
        }

        const payment = await findOrderPayment(
          transaction,
          order.id,
          normalized.paymentId,
        );

        if (!payment) {
          throw new PaymentError("PAYMENT_NOT_FOUND");
        }

        assertMockPaymentMatchesOrder(order, payment);

        if (!isPaymentStatus(payment.status)) {
          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
          throw new PaymentError("ORDER_NOT_PAYABLE");
        }

        if (payment.status !== PAYMENT_STATUS.PENDING) {
          throw new PaymentError("PAYMENT_NOT_PENDING");
        }

        if (
          !canTransitionPaymentStatus(
            payment.status,
            PAYMENT_STATUS.FAILED,
          )
        ) {
          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        const failedPayment = await transaction.payment.updateMany({
          where: {
            id: payment.id,
            orderId: order.id,
            status: PAYMENT_STATUS.PENDING,
            provider: MOCK_PAYMENT_PROVIDER,
            method: MOCK_PAYMENT_METHOD,
            order: {
              userId,
              status: ORDER_STATUS.PENDING_PAYMENT,
            },
          },
          data: {
            status: PAYMENT_STATUS.FAILED,
            failureCode: normalized.failureCode,
            failureReason:
              paymentFailureReasons[normalized.failureCode],
            paidAt: null,
          },
        });

        if (failedPayment.count !== 1) {
          const currentPayment = await findOrderPayment(
            transaction,
            order.id,
            payment.id,
          );
          const currentOrder = await findOwnedOrder(
            transaction,
            userId,
            normalized.orderNumber,
          );

          if (!currentOrder) {
            throw new PaymentError("ORDER_NOT_FOUND");
          }

          if (!currentPayment) {
            throw new PaymentError("PAYMENT_NOT_FOUND");
          }

          if (
            currentOrder.status !==
            ORDER_STATUS.PENDING_PAYMENT
          ) {
            throw new PaymentError("ORDER_NOT_PAYABLE");
          }

          if (
            currentPayment.status !==
            PAYMENT_STATUS.PENDING
          ) {
            throw new PaymentError("PAYMENT_NOT_PENDING");
          }

          throw new PaymentError("PAYMENT_STATE_CONFLICT");
        }

        const failed = await findOrderPayment(
          transaction,
          order.id,
          payment.id,
        );

        if (!failed) {
          throw new PaymentError("PAYMENT_OPERATION_FAILED");
        }

        return toResult(order, failed);
      });
    });
  }

  return {
    startMockPayment,
    completeMockPayment,
    failMockPayment,
  };
}

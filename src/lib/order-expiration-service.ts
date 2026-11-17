import { performance } from "node:perf_hooks";

import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  OrderCancelError,
  createOrderCancelService,
  type OrderCancelErrorCode,
} from "@/lib/order-cancel-service";
import { ORDER_STATUS } from "@/lib/order-status";

export const DEFAULT_ORDER_EXPIRATION_BATCH_SIZE = 50;
export const MAX_ORDER_EXPIRATION_BATCH_SIZE = 100;
export const DEFAULT_ORDER_EXPIRATION_TIME_BUDGET_MS = 10_000;
export const MAX_ORDER_EXPIRATION_TIME_BUDGET_MS = 60_000;

export type OrderExpirationErrorCode =
  | "INVALID_OPTIONS"
  | "INVALID_BATCH_SIZE"
  | "INVALID_TIME_BUDGET"
  | "ORDER_EXPIRATION_SCAN_FAILED";

const orderExpirationErrorMessages: Record<
  OrderExpirationErrorCode,
  string
> = {
  INVALID_OPTIONS: "订单过期扫描参数无效",
  INVALID_BATCH_SIZE: "订单过期扫描批次大小无效",
  INVALID_TIME_BUDGET: "订单过期扫描时间预算无效",
  ORDER_EXPIRATION_SCAN_FAILED: "订单过期扫描失败，请稍后重试",
};

export class OrderExpirationError extends Error {
  readonly code: OrderExpirationErrorCode;

  constructor(
    code: OrderExpirationErrorCode,
    options?: ErrorOptions,
  ) {
    super(orderExpirationErrorMessages[code], options);
    this.name = "OrderExpirationError";
    this.code = code;
  }
}

export type ExpirePendingOrdersOptions = {
  batchSize?: number;
  timeBudgetMs?: number;
};

export type OrderExpirationFailure = {
  orderId: string;
  errorCode: OrderCancelErrorCode | "UNKNOWN_ERROR";
};

export type OrderExpirationResult = {
  scanned: number;
  cancelled: number;
  skipped: number;
  failed: number;
  inconsistent: number;
  deferred: number;
  budgetExhausted: boolean;
  durationMs: number;
  failures: OrderExpirationFailure[];
  inconsistencies: OrderExpirationFailure[];
};

export type OrderExpirationService = {
  expirePendingOrders(
    options?: ExpirePendingOrdersOptions,
  ): Promise<OrderExpirationResult>;
};

type OrderExpirationServiceDependencies = {
  prisma: PrismaClient;
  now?: () => Date;
  getCurrentTimeMs?: () => number;
};

type ExpiredOrderCandidate = {
  id: string;
  orderNumber: string;
  userId: string;
  expiresAtMs: number | bigint;
};

type ExpirationScanCursor = {
  expiresAtMs: number;
  orderId: string;
};

type StoredExpirationScanCursor = {
  cursor: ExpirationScanCursor | null;
  rawValue: string | null;
};

const SKIPPABLE_CANCEL_CODES = new Set<OrderCancelErrorCode>([
  "ORDER_NOT_FOUND",
  "ORDER_NOT_CANCELLABLE",
  "ORDER_ALREADY_CANCELLED",
]);

const ORDER_EXPIRATION_SCAN_CURSOR_KEY =
  "order-expiration.scan-cursor.v1";

function normalizeOptions(value: unknown): Required<
  Pick<ExpirePendingOrdersOptions, "batchSize" | "timeBudgetMs">
> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new OrderExpirationError("INVALID_OPTIONS");
  }

  const options = value as Record<string, unknown>;

  return {
    batchSize: normalizeBatchSize(options.batchSize),
    timeBudgetMs: normalizeTimeBudget(options.timeBudgetMs),
  };
}

function normalizeBatchSize(value: unknown): number {
  const batchSize =
    value === undefined
      ? DEFAULT_ORDER_EXPIRATION_BATCH_SIZE
      : value;

  if (
    typeof batchSize !== "number" ||
    !Number.isSafeInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_ORDER_EXPIRATION_BATCH_SIZE
  ) {
    throw new OrderExpirationError("INVALID_BATCH_SIZE");
  }

  return batchSize;
}

function normalizeTimeBudget(value: unknown): number {
  const timeBudgetMs =
    value === undefined
      ? DEFAULT_ORDER_EXPIRATION_TIME_BUDGET_MS
      : value;

  if (
    typeof timeBudgetMs !== "number" ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < 1 ||
    timeBudgetMs > MAX_ORDER_EXPIRATION_TIME_BUDGET_MS
  ) {
    throw new OrderExpirationError("INVALID_TIME_BUDGET");
  }

  return timeBudgetMs;
}

function toScanFailure(error: unknown): OrderExpirationError {
  return new OrderExpirationError(
    "ORDER_EXPIRATION_SCAN_FAILED",
    { cause: error },
  );
}

function parseScanCursor(value: string | null): ExpirationScanCursor | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf(":");

  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const expiresAtMs = Number(value.slice(0, separatorIndex));
  const orderId = value.slice(separatorIndex + 1);

  if (
    !Number.isSafeInteger(expiresAtMs) ||
    orderId.length === 0
  ) {
    return null;
  }

  return { expiresAtMs, orderId };
}

function serializeScanCursor(
  candidate: ExpiredOrderCandidate,
): string | null {
  const expiresAtMs = Number(candidate.expiresAtMs);

  if (!Number.isSafeInteger(expiresAtMs)) {
    return null;
  }

  return `${expiresAtMs}:${candidate.id}`;
}

async function readScanCursor(
  prisma: PrismaClient,
): Promise<StoredExpirationScanCursor> {
  try {
    const stored = await prisma.appMeta.findUnique({
      where: { key: ORDER_EXPIRATION_SCAN_CURSOR_KEY },
      select: { value: true },
    });
    const rawValue = stored?.value ?? null;

    return {
      cursor: parseScanCursor(rawValue),
      rawValue,
    };
  } catch (error) {
    throw toScanFailure(error);
  }
}

async function advanceScanCursor(
  prisma: PrismaClient,
  storedCursor: StoredExpirationScanCursor,
  candidate: ExpiredOrderCandidate,
): Promise<void> {
  const nextValue = serializeScanCursor(candidate);

  if (!nextValue || nextValue === storedCursor.rawValue) {
    return;
  }

  try {
    if (storedCursor.rawValue === null) {
      try {
        await prisma.appMeta.create({
          data: {
            key: ORDER_EXPIRATION_SCAN_CURSOR_KEY,
            value: nextValue,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return;
        }

        throw error;
      }

      return;
    }

    await prisma.appMeta.updateMany({
      where: {
        key: ORDER_EXPIRATION_SCAN_CURSOR_KEY,
        value: storedCursor.rawValue,
      },
      data: { value: nextValue },
    });
  } catch (error) {
    throw toScanFailure(error);
  }
}

async function findExpiredPendingOrders(
  prisma: PrismaClient,
  batchSize: number,
  cursor: ExpirationScanCursor | null,
): Promise<ExpiredOrderCandidate[]> {
  const rotationOrder = cursor
    ? Prisma.sql`
      CASE
        WHEN
          "expiresAt" > ${cursor.expiresAtMs}
          OR (
            "expiresAt" = ${cursor.expiresAtMs}
            AND "id" > ${cursor.orderId}
          )
        THEN 0
        ELSE 1
      END ASC,
    `
    : Prisma.empty;

  try {
    return await prisma.$queryRaw<
      ExpiredOrderCandidate[]
    >(Prisma.sql`
      WITH "db_clock"("nowMs") AS (
        SELECT CAST(unixepoch('now', 'subsec') * 1000 AS INTEGER)
      )
      SELECT
        "id",
        "orderNumber",
        "userId",
        CAST("expiresAt" AS INTEGER) AS "expiresAtMs"
      FROM "Order"
      WHERE
        "status" = ${ORDER_STATUS.PENDING_PAYMENT}
        AND "expiresAt" IS NOT NULL
        AND "expiresAt" <= (SELECT "nowMs" FROM "db_clock")
      ORDER BY
        ${rotationOrder}
        "expiresAt" ASC,
        "id" ASC
      LIMIT ${batchSize}
    `);
  } catch (error) {
    throw toScanFailure(error);
  }
}

export function createOrderExpirationService({
  prisma,
  now = () => new Date(),
  getCurrentTimeMs = () => performance.now(),
}: OrderExpirationServiceDependencies): OrderExpirationService {
  async function expirePendingOrders(
    options: ExpirePendingOrdersOptions = {},
  ): Promise<OrderExpirationResult> {
    const { batchSize, timeBudgetMs } = normalizeOptions(options);
    const startedAt = getCurrentTimeMs();
    const storedCursor = await readScanCursor(prisma);
    const candidates = await findExpiredPendingOrders(
      prisma,
      batchSize,
      storedCursor.cursor,
    );
    const result: OrderExpirationResult = {
      scanned: candidates.length,
      cancelled: 0,
      skipped: 0,
      failed: 0,
      inconsistent: 0,
      deferred: 0,
      budgetExhausted: false,
      durationMs: 0,
      failures: [],
      inconsistencies: [],
    };
    let lastCandidate: ExpiredOrderCandidate | null = null;

    for (
      let index = 0;
      index < candidates.length;
      index += 1
    ) {
      if (getCurrentTimeMs() - startedAt >= timeBudgetMs) {
        result.deferred = candidates.length - index;
        result.budgetExhausted = true;
        break;
      }

      const candidate = candidates[index];
      lastCandidate = candidate;

      try {
        const cancelService = createOrderCancelService({
          prisma,
          getCurrentUserId: async () => candidate.userId,
          now,
        });
        const cancelResult = await cancelService.cancelOrder({
          orderNumber: candidate.orderNumber,
        });

        if (cancelResult.outcome === "CANCELLED") {
          result.cancelled += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error) {
        if (
          error instanceof OrderCancelError &&
          error.code === "SUCCESSFUL_PAYMENT_EXISTS"
        ) {
          result.inconsistent += 1;
          result.inconsistencies.push({
            orderId: candidate.id,
            errorCode: error.code,
          });
          continue;
        }

        if (
          error instanceof OrderCancelError &&
          SKIPPABLE_CANCEL_CODES.has(error.code)
        ) {
          result.skipped += 1;
          continue;
        }

        result.failed += 1;
        result.failures.push({
          orderId: candidate.id,
          errorCode:
            error instanceof OrderCancelError
              ? error.code
              : "UNKNOWN_ERROR",
        });
      }
    }

    if (lastCandidate) {
      await advanceScanCursor(
        prisma,
        storedCursor,
        lastCandidate,
      );
    }

    result.durationMs = Math.max(
      0,
      getCurrentTimeMs() - startedAt,
    );

    return result;
  }

  return { expirePendingOrders };
}

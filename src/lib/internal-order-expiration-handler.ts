import { performance } from "node:perf_hooks";

import type {
  InternalTaskAuthResult,
} from "@/lib/internal-task-auth";
import type {
  ExpirePendingOrdersOptions,
  OrderExpirationResult,
  OrderExpirationService,
} from "@/lib/order-expiration-service";

const MAX_REQUEST_BODY_BYTES = 1024;
const DEFAULT_BATCH_SIZE = 50;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 100;
const DEFAULT_TIME_BUDGET_MS = 10_000;
const MIN_TIME_BUDGET_MS = 1;
const MAX_TIME_BUDGET_MS = 60_000;
const SCAN_FAILED_CODE = "ORDER_EXPIRATION_SCAN_FAILED";
const UNAVAILABLE_EXECUTION_ID = "execution-id-unavailable";
const ALLOWED_BODY_FIELDS = new Set([
  "batchSize",
  "timeBudgetMs",
]);

export type InternalOrderExpirationErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "METHOD_NOT_ALLOWED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type InternalOrderExpirationLogPhase =
  | "method"
  | "authorization"
  | "validation"
  | "scan"
  | "request";

export type InternalOrderExpirationLogOutcome =
  | "success"
  | "rejected"
  | "failed";

export type InternalOrderExpirationStats = {
  scanned: number;
  cancelled: number;
  skipped: number;
  failed: number;
  inconsistent: number;
  deferred: number;
  budgetExhausted: boolean;
};

export type InternalOrderExpirationLogEvent = {
  event: "internal_order_expiration";
  executionId: string;
  phase: InternalOrderExpirationLogPhase;
  outcome: InternalOrderExpirationLogOutcome;
  httpStatus: number;
  errorCode: InternalOrderExpirationErrorCode | null;
  batchSize?: number;
  timeBudgetMs?: number;
  stats?: InternalOrderExpirationStats;
  failureCountsByErrorCode?: Record<string, number>;
  durationMs: number;
};

export type InternalOrderExpirationHandlerDependencies = {
  authenticate: (input: {
    authorization: string | null | undefined;
  }) => InternalTaskAuthResult;
  createExpirationService: () => OrderExpirationService;
  createExecutionId: () => string;
  log: (event: InternalOrderExpirationLogEvent) => void;
};

export type InternalOrderExpirationHandler = (
  request: Request,
) => Promise<Response>;

type ValidatedOptions = Required<
  Pick<ExpirePendingOrdersOptions, "batchSize" | "timeBudgetMs">
>;

type ErrorResponseBody = {
  executionId: string;
  error: {
    code: InternalOrderExpirationErrorCode;
  };
};

type SuccessResponseBody = InternalOrderExpirationStats & {
  executionId: string;
  durationMs: number;
};

class InvalidRequestError extends Error {
  constructor() {
    super("Invalid internal order expiration request");
    this.name = "InvalidRequestError";
  }
}

function responseHeaders(
  additionalHeaders?: Record<string, string>,
): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    ...additionalHeaders,
  });
}

function jsonResponse(
  request: Request,
  body: unknown,
  status: number,
  additionalHeaders?: Record<string, string>,
): Response {
  const headers = responseHeaders(additionalHeaders);

  if (request.method === "HEAD") {
    return new Response(null, { status, headers });
  }

  return Response.json(body, { status, headers });
}

function errorResponse(
  request: Request,
  executionId: string,
  status: number,
  code: InternalOrderExpirationErrorCode,
  additionalHeaders?: Record<string, string>,
): Response {
  return jsonResponse(
    request,
    {
      executionId,
      error: { code },
    } satisfies ErrorResponseBody,
    status,
    additionalHeaders,
  );
}

function successResponse(
  request: Request,
  executionId: string,
  result: OrderExpirationResult,
): Response {
  return jsonResponse(
    request,
    {
      executionId,
      scanned: result.scanned,
      cancelled: result.cancelled,
      skipped: result.skipped,
      failed: result.failed,
      inconsistent: result.inconsistent,
      deferred: result.deferred,
      budgetExhausted: result.budgetExhausted,
      durationMs: result.durationMs,
    } satisfies SuccessResponseBody,
    200,
  );
}

function validateContentLength(request: Request): void {
  const rawContentLength = request.headers.get("content-length");

  if (rawContentLength === null) {
    return;
  }

  const contentLengthText = rawContentLength.trim();

  if (!/^\d+$/.test(contentLengthText)) {
    throw new InvalidRequestError();
  }

  const contentLength = Number(contentLengthText);

  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength > MAX_REQUEST_BODY_BYTES
  ) {
    throw new InvalidRequestError();
  }
}

async function readRequestBodyBytes(
  request: Request,
): Promise<Uint8Array | null> {
  const body = request.body;

  if (body === null) {
    return null;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The rejection remains a deterministic 400 response.
        }

        throw new InvalidRequestError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) {
    return null;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidRequestError();
  }
}

function parseJsonBody(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(decodeUtf8(bytes));
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      throw error;
    }

    throw new InvalidRequestError();
  }
}

function validateOptions(value: unknown): ValidatedOptions {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new InvalidRequestError();
  }

  const options = value as Record<string, unknown>;

  for (const key of Object.keys(options)) {
    if (!ALLOWED_BODY_FIELDS.has(key)) {
      throw new InvalidRequestError();
    }
  }

  const batchSize = Object.hasOwn(options, "batchSize")
    ? options.batchSize
    : DEFAULT_BATCH_SIZE;
  const timeBudgetMs = Object.hasOwn(options, "timeBudgetMs")
    ? options.timeBudgetMs
    : DEFAULT_TIME_BUDGET_MS;

  if (
    typeof batchSize !== "number" ||
    !Number.isSafeInteger(batchSize) ||
    batchSize < MIN_BATCH_SIZE ||
    batchSize > MAX_BATCH_SIZE
  ) {
    throw new InvalidRequestError();
  }

  if (
    typeof timeBudgetMs !== "number" ||
    !Number.isSafeInteger(timeBudgetMs) ||
    timeBudgetMs < MIN_TIME_BUDGET_MS ||
    timeBudgetMs > MAX_TIME_BUDGET_MS
  ) {
    throw new InvalidRequestError();
  }

  return { batchSize, timeBudgetMs };
}

async function readOptions(request: Request): Promise<ValidatedOptions> {
  validateContentLength(request);
  const bytes = await readRequestBodyBytes(request);

  if (bytes === null) {
    return {
      batchSize: DEFAULT_BATCH_SIZE,
      timeBudgetMs: DEFAULT_TIME_BUDGET_MS,
    };
  }

  return validateOptions(parseJsonBody(bytes));
}

function countFailures(
  result: OrderExpirationResult,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const failure of [
    ...result.failures,
    ...result.inconsistencies,
  ]) {
    counts[failure.errorCode] =
      (counts[failure.errorCode] ?? 0) + 1;
  }

  return counts;
}

function toStats(
  result: OrderExpirationResult,
): InternalOrderExpirationStats {
  return {
    scanned: result.scanned,
    cancelled: result.cancelled,
    skipped: result.skipped,
    failed: result.failed,
    inconsistent: result.inconsistent,
    deferred: result.deferred,
    budgetExhausted: result.budgetExhausted,
  };
}

function isScanInfrastructureFailure(error: unknown): boolean {
  try {
    return (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === SCAN_FAILED_CODE
    );
  } catch {
    return false;
  }
}

function safeLog(
  log: InternalOrderExpirationHandlerDependencies["log"],
  event: InternalOrderExpirationLogEvent,
): void {
  try {
    log(event);
  } catch {
    // Logging must never alter the HTTP contract.
  }
}

export function createInternalOrderExpirationHandler({
  authenticate,
  createExpirationService,
  createExecutionId,
  log,
}: InternalOrderExpirationHandlerDependencies): InternalOrderExpirationHandler {
  return async function handleInternalOrderExpiration(
    request,
  ): Promise<Response> {
    const startedAt = performance.now();
    let executionId: string;

    try {
      executionId = createExecutionId();
    } catch {
      safeLog(log, {
        event: "internal_order_expiration",
        executionId: UNAVAILABLE_EXECUTION_ID,
        phase: "request",
        outcome: "failed",
        httpStatus: 500,
        errorCode: "INTERNAL_ERROR",
        durationMs: Math.max(
          0,
          Math.round(performance.now() - startedAt),
        ),
      });

      return errorResponse(
        request,
        UNAVAILABLE_EXECUTION_ID,
        500,
        "INTERNAL_ERROR",
      );
    }

    function finish(
      phase: InternalOrderExpirationLogPhase,
      outcome: InternalOrderExpirationLogOutcome,
      httpStatus: number,
      errorCode: InternalOrderExpirationErrorCode | null,
      options?: ValidatedOptions,
      result?: OrderExpirationResult,
    ): Response {
      const durationMs =
        result?.durationMs ??
        Math.max(0, Math.round(performance.now() - startedAt));
      const event: InternalOrderExpirationLogEvent = {
        event: "internal_order_expiration",
        executionId,
        phase,
        outcome,
        httpStatus,
        errorCode,
        durationMs,
      };

      if (options) {
        event.batchSize = options.batchSize;
        event.timeBudgetMs = options.timeBudgetMs;
      }

      if (result) {
        event.stats = toStats(result);
        event.failureCountsByErrorCode = countFailures(result);
      }

      safeLog(log, event);

      if (result) {
        return successResponse(request, executionId, result);
      }

      return errorResponse(
        request,
        executionId,
        httpStatus,
        errorCode ?? "INTERNAL_ERROR",
        httpStatus === 405 ? { Allow: "POST" } : undefined,
      );
    }

    if (request.method !== "POST") {
      return finish(
        "method",
        "rejected",
        405,
        "METHOD_NOT_ALLOWED",
      );
    }

    let authentication: InternalTaskAuthResult;

    try {
      authentication = authenticate({
        authorization: request.headers.get("authorization"),
      });
    } catch {
      return finish(
        "authorization",
        "failed",
        500,
        "INTERNAL_ERROR",
      );
    }

    if (authentication.status === "UNAUTHORIZED") {
      return finish(
        "authorization",
        "rejected",
        401,
        "UNAUTHORIZED",
      );
    }

    if (authentication.status === "CONFIGURATION_ERROR") {
      return finish(
        "authorization",
        "failed",
        503,
        "SERVICE_UNAVAILABLE",
      );
    }

    let options: ValidatedOptions;

    try {
      options = await readOptions(request);
    } catch (error) {
      if (error instanceof InvalidRequestError) {
        return finish(
          "validation",
          "rejected",
          400,
          "INVALID_REQUEST",
        );
      }

      return finish(
        "validation",
        "failed",
        500,
        "INTERNAL_ERROR",
      );
    }

    try {
      const service = createExpirationService();
      const result = await service.expirePendingOrders(options);

      return finish(
        "scan",
        "success",
        200,
        null,
        options,
        result,
      );
    } catch (error) {
      if (isScanInfrastructureFailure(error)) {
        return finish(
          "scan",
          "failed",
          503,
          "SERVICE_UNAVAILABLE",
          options,
        );
      }

      return finish(
        "scan",
        "failed",
        500,
        "INTERNAL_ERROR",
        options,
      );
    }
  };
}

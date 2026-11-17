import assert from "node:assert/strict";
import test from "node:test";

import type {
  InternalOrderExpirationHandlerDependencies,
  InternalOrderExpirationLogEvent,
} from "../src/lib/internal-order-expiration-handler";
import {
  createInternalOrderExpirationHandler,
} from "../src/lib/internal-order-expiration-handler";
import type {
  ExpirePendingOrdersOptions,
  OrderExpirationResult,
} from "../src/lib/order-expiration-service";

const ENDPOINT = "http://localhost/api/internal/orders/expire";
const AUTHORIZATION = "Bearer test-token";
const EXECUTION_ID = "execution-test-001";
const UNAVAILABLE_EXECUTION_ID = "execution-id-unavailable";

type Authenticate =
  InternalOrderExpirationHandlerDependencies["authenticate"];
type CreateExecutionId =
  InternalOrderExpirationHandlerDependencies["createExecutionId"];
type Log =
  InternalOrderExpirationHandlerDependencies["log"];
type ExpirePendingOrders = (
  options?: ExpirePendingOrdersOptions,
) => Promise<OrderExpirationResult>;

function successfulResult(
  overrides: Partial<OrderExpirationResult> = {},
): OrderExpirationResult {
  return {
    scanned: 12,
    cancelled: 8,
    skipped: 1,
    failed: 2,
    inconsistent: 1,
    deferred: 0,
    budgetExhausted: false,
    durationMs: 321,
    failures: [
      {
        orderId: "sensitive-order-failure",
        errorCode: "STOCK_RESTORE_FAILED",
      },
      {
        orderId: "sensitive-order-unknown",
        errorCode: "UNKNOWN_ERROR",
      },
    ],
    inconsistencies: [
      {
        orderId: "sensitive-order-inconsistent",
        errorCode: "SUCCESSFUL_PAYMENT_EXISTS",
      },
    ],
    ...overrides,
  };
}

const authorize: Authenticate = () => ({
  status: "AUTHORIZED",
  error: null,
});

function createHarness({
  authenticate = authorize,
  createExecutionId = () => EXECUTION_ID,
  expirePendingOrders = async () => successfulResult(),
  log = () => undefined,
}: {
  authenticate?: Authenticate;
  createExecutionId?: CreateExecutionId;
  expirePendingOrders?: ExpirePendingOrders;
  log?: Log;
} = {}) {
  const calls: string[] = [];
  const authenticateCalls: Parameters<Authenticate>[0][] = [];
  const createServiceCalls: number[] = [];
  const expireCalls: Array<
    ExpirePendingOrdersOptions | undefined
  > = [];
  const executionIdCalls: number[] = [];
  const events: InternalOrderExpirationLogEvent[] = [];
  let bodyAccesses = 0;

  const handler = createInternalOrderExpirationHandler({
    authenticate(input) {
      calls.push("authenticate");
      authenticateCalls.push(input);
      return authenticate(input);
    },
    createExecutionId() {
      calls.push("executionId");
      executionIdCalls.push(Date.now());
      return createExecutionId();
    },
    createExpirationService() {
      calls.push("createService");
      createServiceCalls.push(Date.now());

      return {
        async expirePendingOrders(options) {
          calls.push("expire");
          expireCalls.push(options);
          return expirePendingOrders(options);
        },
      };
    },
    log(event) {
      events.push(event);
      return log(event);
    },
  });

  return {
    handler,
    calls,
    authenticateCalls,
    createServiceCalls,
    expireCalls,
    executionIdCalls,
    events,
    getBodyAccesses: () => bodyAccesses,
    countBodyAccess: () => {
      bodyAccesses += 1;
    },
  };
}

function postRequest(
  body?: string | Uint8Array,
  headers: Record<string, string> = {
    authorization: AUTHORIZATION,
  },
) {
  const requestBody =
    typeof body === "string" || body === undefined
      ? body
      : new Blob([body as unknown as BlobPart]);

  return new Request(ENDPOINT, {
    method: "POST",
    headers,
    body: requestBody,
  });
}

function postWithBodyAccessProbe(
  headers: Record<string, string> = {
    authorization: AUTHORIZATION,
  },
  method = "POST",
) {
  let bodyAccesses = 0;
  const request = {
    method,
    headers: new Headers(headers),
    get body() {
      bodyAccesses += 1;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("{}"));
          controller.close();
        },
      });
    },
  } as unknown as Request;

  return {
    request,
    get bodyAccesses() {
      return bodyAccesses;
    },
  };
}

function streamingPostRequest(
  chunks: Uint8Array[],
  headers: Record<string, string> = {
    authorization: AUTHORIZATION,
  },
) {
  let pulls = 0;
  let pulledBytes = 0;
  let chunkIndex = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[chunkIndex];
      chunkIndex += 1;
      pulls += 1;

      if (chunk === undefined) {
        controller.close();
        return;
      }

      pulledBytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const request = new Request(ENDPOINT, {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return {
    request,
    get pulls() {
      return pulls;
    },
    get pulledBytes() {
      return pulledBytes;
    },
  };
}

function requestWithBodyStream(
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {
    authorization: AUTHORIZATION,
  },
) {
  return {
    method: "POST",
    headers: new Headers(headers),
    body,
  } as unknown as Request;
}

async function waitForStreamSettlement() {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function assertReaderLockReleased(
  stream: ReadableStream<Uint8Array>,
) {
  const reader = stream.getReader();
  reader.releaseLock();
}

async function assertErrorResponse(
  response: Response,
  status: number,
  code: string,
  executionId = EXECUTION_ID,
) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    executionId,
    error: { code },
  });
}

test("generates an execution id before checking the request method", async () => {
  const harness = createHarness();
  const { request, bodyAccesses } = postWithBodyAccessProbe(
    { authorization: AUTHORIZATION },
    "GET",
  );

  const response = await harness.handler(request);

  assert.equal(response.status, 405);
  assert.equal(bodyAccesses, 0);
  assert.deepEqual(harness.calls, ["executionId"]);
  assert.equal(harness.authenticateCalls.length, 0);
  assert.equal(harness.createServiceCalls.length, 0);
  assert.equal(harness.expireCalls.length, 0);
});

test("returns a controlled 500 when execution id generation fails", async () => {
  let attempts = 0;
  const harness = createHarness({
    createExecutionId: () => {
      attempts += 1;
      throw new Error(
        "sensitive execution id generator failure",
      );
    },
  });
  const { request, bodyAccesses } = postWithBodyAccessProbe();

  const response = await harness.handler(request);

  await assertErrorResponse(
    response,
    500,
    "INTERNAL_ERROR",
    UNAVAILABLE_EXECUTION_ID,
  );
  assert.equal(
    response.headers.get("content-type"),
    "application/json",
  );
  assert.equal(attempts, 1);
  assert.equal(bodyAccesses, 0);
  assert.equal(harness.authenticateCalls.length, 0);
  assert.equal(harness.createServiceCalls.length, 0);
  assert.equal(harness.expireCalls.length, 0);
  assert.doesNotMatch(
    JSON.stringify(harness.events),
    /sensitive execution id generator failure/,
  );
});

test("authenticates before accessing the request body", async () => {
  const harness = createHarness({
    authenticate: () => ({
      status: "UNAUTHORIZED",
      error: "CRON_TOKEN_INVALID",
    }),
  });
  const { request, bodyAccesses } = postWithBodyAccessProbe();

  const response = await harness.handler(request);

  assert.equal(response.status, 401);
  assert.equal(bodyAccesses, 0);
  assert.deepEqual(harness.calls, ["executionId", "authenticate"]);
  assert.equal(harness.createServiceCalls.length, 0);
});

test("passes the complete authorization header to authentication", async () => {
  const authorization = "Bearer token-one, Bearer token-two";
  const harness = createHarness();

  const response = await harness.handler(postRequest(undefined, {
    authorization,
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(harness.authenticateCalls, [{ authorization }]);
});

test("does not create the scanner for an authentication configuration error", async () => {
  const harness = createHarness({
    authenticate: () => ({
      status: "CONFIGURATION_ERROR",
      error: "CRON_SECRET_MISSING",
    }),
  });
  const { request, bodyAccesses } = postWithBodyAccessProbe();

  const response = await harness.handler(request);

  await assertErrorResponse(response, 503, "SERVICE_UNAVAILABLE");
  assert.equal(bodyAccesses, 0);
  assert.equal(harness.createServiceCalls.length, 0);
  assert.equal(harness.expireCalls.length, 0);
});

test("does not create the scanner for an unauthorized request", async () => {
  const harness = createHarness({
    authenticate: () => ({
      status: "UNAUTHORIZED",
      error: "CRON_TOKEN_MISSING",
    }),
  });

  const response = await harness.handler(postRequest());

  await assertErrorResponse(response, 401, "UNAUTHORIZED");
  assert.equal(harness.createServiceCalls.length, 0);
  assert.equal(harness.expireCalls.length, 0);
});

test("uses defaults for an empty body", async () => {
  const harness = createHarness();

  const response = await harness.handler(postRequest());

  assert.equal(response.status, 200);
  assert.deepEqual(harness.expireCalls, [
    { batchSize: 50, timeBudgetMs: 10_000 },
  ]);
});

test("uses defaults for an empty JSON object", async () => {
  const harness = createHarness();

  const response = await harness.handler(postRequest("{}"));

  assert.equal(response.status, 200);
  assert.deepEqual(harness.expireCalls, [
    { batchSize: 50, timeBudgetMs: 10_000 },
  ]);
});

test("fills in individual default fields", async () => {
  const batchHarness = createHarness();
  const budgetHarness = createHarness();

  await batchHarness.handler(postRequest('{"batchSize":7}'));
  await budgetHarness.handler(postRequest('{"timeBudgetMs":250}'));

  assert.deepEqual(batchHarness.expireCalls, [
    { batchSize: 7, timeBudgetMs: 10_000 },
  ]);
  assert.deepEqual(budgetHarness.expireCalls, [
    { batchSize: 50, timeBudgetMs: 250 },
  ]);
});

test("accepts inclusive batch size and time budget boundaries", async () => {
  for (const options of [
    { batchSize: 1, timeBudgetMs: 1 },
    { batchSize: 100, timeBudgetMs: 60_000 },
  ]) {
    const harness = createHarness();
    const response = await harness.handler(
      postRequest(JSON.stringify(options)),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(harness.expireCalls, [options]);
  }
});

test("rejects unsafe, out-of-range, and mistyped numeric options", async () => {
  const invalidValues: Array<Record<string, unknown>> = [
    { batchSize: 0 },
    { batchSize: 101 },
    { batchSize: 1.5 },
    { batchSize: Number.MAX_SAFE_INTEGER + 1 },
    { batchSize: "50" },
    { batchSize: null },
    { batchSize: true },
    { timeBudgetMs: 0 },
    { timeBudgetMs: 60_001 },
    { timeBudgetMs: 1.5 },
    { timeBudgetMs: Number.MAX_SAFE_INTEGER + 1 },
    { timeBudgetMs: "1000" },
    { timeBudgetMs: null },
    { timeBudgetMs: false },
  ];

  for (const value of invalidValues) {
    const harness = createHarness();
    const response = await harness.handler(
      postRequest(JSON.stringify(value)),
    );

    await assertErrorResponse(response, 400, "INVALID_REQUEST");
    assert.equal(harness.createServiceCalls.length, 0);
    assert.equal(harness.expireCalls.length, 0);
  }
});

test("rejects JSON values that are not objects", async () => {
  for (const body of ["null", "[]", '"value"', "1", "true"]) {
    const harness = createHarness();
    const response = await harness.handler(postRequest(body));

    await assertErrorResponse(response, 400, "INVALID_REQUEST");
    assert.equal(harness.createServiceCalls.length, 0);
  }
});

test("rejects invalid JSON", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    postRequest('{"batchSize":'),
  );

  await assertErrorResponse(response, 400, "INVALID_REQUEST");
  assert.equal(harness.createServiceCalls.length, 0);
});

test("rejects invalid UTF-8 bytes", async () => {
  const harness = createHarness();

  const response = await harness.handler(
    postRequest(new Uint8Array([0x7b, 0xc3, 0x28, 0x7d])),
  );

  await assertErrorResponse(response, 400, "INVALID_REQUEST");
  assert.equal(harness.createServiceCalls.length, 0);
});

test("rejects unknown fields", async () => {
  for (const body of [
    '{"userId":"sensitive-user"}',
    '{"orderId":"sensitive-order"}',
    '{"expiresAt":123}',
    '{"batchSize":1,"extra":true}',
  ]) {
    const harness = createHarness();
    const response = await harness.handler(postRequest(body));

    await assertErrorResponse(response, 400, "INVALID_REQUEST");
    assert.equal(harness.createServiceCalls.length, 0);
  }
});

test("accepts a request body of exactly 1024 UTF-8 bytes", async () => {
  const body = JSON.stringify({
    batchSize: 1,
    timeBudgetMs: 1,
  }).padEnd(1024, " ");

  assert.equal(Buffer.byteLength(body, "utf8"), 1024);
  const harness = createHarness();

  const response = await harness.handler(postRequest(body));

  assert.equal(response.status, 200);
  assert.deepEqual(harness.expireCalls, [
    { batchSize: 1, timeBudgetMs: 1 },
  ]);
});

test("rejects a request body of 1025 UTF-8 bytes", async () => {
  const body = "{}".padEnd(1025, " ");

  assert.equal(Buffer.byteLength(body, "utf8"), 1025);
  const harness = createHarness();

  const response = await harness.handler(postRequest(body));

  await assertErrorResponse(response, 400, "INVALID_REQUEST");
  assert.equal(harness.createServiceCalls.length, 0);
});

test("accumulates chunked body bytes and rejects at 1025", async () => {
  const harness = createHarness();
  const streaming = streamingPostRequest([
    new TextEncoder().encode("{}".padEnd(512, " ")),
    new TextEncoder().encode("".padEnd(513, " ")),
  ]);

  const response = await harness.handler(streaming.request);

  await assertErrorResponse(response, 400, "INVALID_REQUEST");
  assert.equal(streaming.pulledBytes, 1025);
  assert.equal(harness.createServiceCalls.length, 0);
});

test("stops pulling and cancels when the body exceeds 1024 bytes", async () => {
  let pulls = 0;
  let cancelCalls = 0;
  let pullsWhenCancelled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1025));
      },
      cancel() {
        cancelCalls += 1;
        pullsWhenCancelled = pulls;
      },
    },
    { highWaterMark: 0 },
  );
  const harness = createHarness();

  const response = await harness.handler(
    requestWithBodyStream(stream),
  );
  await waitForStreamSettlement();

  await assertErrorResponse(response, 400, "INVALID_REQUEST");
  assert.equal(cancelCalls, 1);
  assert.equal(pullsWhenCancelled, 1);
  assert.equal(pulls, pullsWhenCancelled);
  assert.equal(harness.createServiceCalls.length, 0);
  assertReaderLockReleased(stream);
});

test("returns 400 and stops reading when reader.cancel rejects", async () => {
  let pulls = 0;
  let cancelCalls = 0;
  let pullsWhenCancelled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1025));
      },
      cancel() {
        cancelCalls += 1;
        pullsWhenCancelled = pulls;
        throw new Error("sensitive reader cancel failure");
      },
    },
    { highWaterMark: 0 },
  );
  const harness = createHarness();

  const response = await harness.handler(
    requestWithBodyStream(stream),
  );
  await waitForStreamSettlement();

  await assertErrorResponse(response, 400, "INVALID_REQUEST");
  assert.equal(cancelCalls, 1);
  assert.equal(pullsWhenCancelled, 1);
  assert.equal(pulls, pullsWhenCancelled);
  assert.equal(harness.createServiceCalls.length, 0);
  assert.doesNotMatch(
    JSON.stringify(harness.events),
    /sensitive reader cancel failure/,
  );
  assertReaderLockReleased(stream);
});

test("rejects an oversized content length without accessing the body", async () => {
  const harness = createHarness();
  const { request, bodyAccesses } = postWithBodyAccessProbe({
    authorization: AUTHORIZATION,
    "content-length": "1025",
  });

  const response = await harness.handler(request);

  await assertErrorResponse(response, 400, "INVALID_REQUEST");
  assert.equal(bodyAccesses, 0);
  assert.equal(harness.createServiceCalls.length, 0);
});

test("does not trust a small content length when the stream exceeds the limit", async () => {
  const harness = createHarness();
  const { request } = streamingPostRequest(
    [
      new TextEncoder().encode("{}".padEnd(1024, " ")),
      new TextEncoder().encode(" "),
    ],
    {
      authorization: AUTHORIZATION,
      "content-length": "2",
    },
  );

  const response = await harness.handler(request);

  await assertErrorResponse(response, 400, "INVALID_REQUEST");
  assert.equal(harness.createServiceCalls.length, 0);
});

test("returns the safe aggregate result of a completed scan", async () => {
  const harness = createHarness();

  const response = await harness.handler(postRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(body, {
    executionId: EXECUTION_ID,
    scanned: 12,
    cancelled: 8,
    skipped: 1,
    failed: 2,
    inconsistent: 1,
    deferred: 0,
    budgetExhausted: false,
    durationMs: 321,
  });
});

test("returns 200 for partial failures, inconsistencies, and exhausted budget", async () => {
  const harness = createHarness({
    expirePendingOrders: async () =>
      successfulResult({
        scanned: 5,
        cancelled: 1,
        skipped: 0,
        failed: 2,
        inconsistent: 1,
        deferred: 1,
        budgetExhausted: true,
        durationMs: 10_000,
      }),
  });

  const response = await harness.handler(postRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    executionId: EXECUTION_ID,
    scanned: 5,
    cancelled: 1,
    skipped: 0,
    failed: 2,
    inconsistent: 1,
    deferred: 1,
    budgetExhausted: true,
    durationMs: 10_000,
  });
});

test("does not expose order identifiers or raw service details", async () => {
  const harness = createHarness();

  const response = await harness.handler(postRequest());
  const serialized = await response.text();

  assert.doesNotMatch(serialized, /sensitive-order/);
  assert.doesNotMatch(serialized, /failures|inconsistencies/);
  assert.doesNotMatch(serialized, /STOCK_RESTORE_FAILED/);
});

test("maps a scan infrastructure failure to 503 without leaking it", async () => {
  const harness = createHarness({
    expirePendingOrders: async () => {
      throw Object.assign(
        new Error(
          "SQL SELECT failed for secret@example.com and order-sensitive-id",
        ),
        {
          code: "ORDER_EXPIRATION_SCAN_FAILED",
        },
      );
    },
  });

  const response = await harness.handler(postRequest());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.deepEqual(body, {
    executionId: EXECUTION_ID,
    error: { code: "SERVICE_UNAVAILABLE" },
  });
  assert.doesNotMatch(
    JSON.stringify(body),
    /SQL|secret|sensitive|stack|cause/,
  );
});

test("maps an unexpected exception to 500 without leaking it", async () => {
  const harness = createHarness({
    expirePendingOrders: async () => {
      throw new Error(
        "unexpected sensitive failure for user-sensitive-id",
      );
    },
  });

  const response = await harness.handler(postRequest());
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    executionId: EXECUTION_ID,
    error: { code: "INTERNAL_ERROR" },
  });
  assert.doesNotMatch(
    JSON.stringify(body),
    /unexpected|sensitive|stack|cause/,
  );
});

test("sets no-store and no CORS on every response category", async () => {
  const cases: Array<Promise<Response>> = [];
  const methodHarness = createHarness();
  const unauthorizedHarness = createHarness({
    authenticate: () => ({
      status: "UNAUTHORIZED",
      error: "CRON_TOKEN_MISSING",
    }),
  });
  const configurationHarness = createHarness({
    authenticate: () => ({
      status: "CONFIGURATION_ERROR",
      error: "CRON_SECRET_INVALID",
    }),
  });
  const scanFailureHarness = createHarness({
    expirePendingOrders: async () => {
      throw Object.assign(new Error("hidden"), {
        code: "ORDER_EXPIRATION_SCAN_FAILED",
      });
    },
  });
  const unexpectedFailureHarness = createHarness({
    expirePendingOrders: async () => {
      throw new Error("hidden");
    },
  });
  const methodRequest = new Request(ENDPOINT, { method: "GET" });

  cases.push(methodHarness.handler(methodRequest));
  cases.push(unauthorizedHarness.handler(postRequest()));
  cases.push(configurationHarness.handler(postRequest()));
  cases.push(createHarness().handler(postRequest("not-json")));
  cases.push(createHarness().handler(postRequest()));
  cases.push(scanFailureHarness.handler(postRequest()));
  cases.push(unexpectedFailureHarness.handler(postRequest()));

  for (const response of await Promise.all(cases)) {
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      null,
    );
    assert.equal(
      response.headers.get("access-control-allow-methods"),
      null,
    );
  }
});

test("uses the response execution id as the log correlation id", async () => {
  const harness = createHarness();

  const response = await harness.handler(postRequest());
  const body = await response.json();

  assert.equal(harness.events.length, 1);
  assert.equal(body.executionId, EXECUTION_ID);
  assert.equal(harness.events[0].executionId, EXECUTION_ID);
  assert.equal(harness.events[0].phase, "scan");
  assert.equal(harness.events[0].outcome, "success");
  assert.equal(harness.events[0].httpStatus, 200);
});

test("logs only allowlisted safe values and aggregate failure counts", async () => {
  const harness = createHarness({
    expirePendingOrders: async () =>
      successfulResult({
        failures: [
          {
            orderId: "sensitive-order-one",
            errorCode: "STOCK_RESTORE_FAILED",
          },
          {
            orderId: "sensitive-order-two",
            errorCode: "STOCK_RESTORE_FAILED",
          },
          {
            orderId: "sensitive-order-three",
            errorCode: "UNKNOWN_ERROR",
          },
        ],
        inconsistencies: [
          {
            orderId: "sensitive-inconsistent",
            errorCode: "SUCCESSFUL_PAYMENT_EXISTS",
          },
        ],
      }),
  });

  await harness.handler(
    postRequest('{"batchSize":7,"timeBudgetMs":250}', {
      authorization: "Bearer sensitive-authorization",
    }),
  );

  assert.equal(harness.events.length, 1);
  assert.deepEqual(harness.events[0].failureCountsByErrorCode, {
    STOCK_RESTORE_FAILED: 2,
    UNKNOWN_ERROR: 1,
    SUCCESSFUL_PAYMENT_EXISTS: 1,
  });
  assert.deepEqual(harness.events[0].stats, {
    scanned: 12,
    cancelled: 8,
    skipped: 1,
    failed: 2,
    inconsistent: 1,
    deferred: 0,
    budgetExhausted: false,
  });
  assert.equal(harness.events[0].batchSize, 7);
  assert.equal(harness.events[0].timeBudgetMs, 250);

  const serialized = JSON.stringify(harness.events[0]);
  assert.doesNotMatch(serialized, /sensitive-authorization/);
  assert.doesNotMatch(serialized, /sensitive-order/);
  assert.doesNotMatch(serialized, /sensitive-inconsistent/);
});

test("keeps the original response when the log sink throws", async () => {
  const harness = createHarness({
    log: () => {
      throw new Error("log sink failed with sensitive details");
    },
  });

  const response = await harness.handler(postRequest());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(body, {
    executionId: EXECUTION_ID,
    scanned: 12,
    cancelled: 8,
    skipped: 1,
    failed: 2,
    inconsistent: 1,
    deferred: 0,
    budgetExhausted: false,
    durationMs: 321,
  });
});

test("does not authenticate, read the body, or scan for non-POST methods", async () => {
  for (const method of [
    "GET",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ]) {
    const harness = createHarness();
    const { request } = postWithBodyAccessProbe(
      { authorization: AUTHORIZATION },
      method,
    );

    const response = await harness.handler(request);

    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(harness.executionIdCalls.length, 1);
    assert.equal(harness.authenticateCalls.length, 0);
    assert.equal(harness.createServiceCalls.length, 0);
    assert.equal(harness.expireCalls.length, 0);

    if (method === "HEAD") {
      assert.equal(await response.text(), "");
    } else {
      assert.deepEqual(await response.json(), {
        executionId: EXECUTION_ID,
        error: { code: "METHOD_NOT_ALLOWED" },
      });
    }
  }
});

test("route exports POST and explicit 405 handlers for supported methods", async () => {
  const route = await import(
    "../src/app/api/internal/orders/expire/route"
  );

  for (const method of [
    "POST",
    "GET",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ] as const) {
    assert.equal(typeof route[method], "function");
  }

  assert.equal("runtime" in route, false);

  const head = await route.HEAD(
    new Request(ENDPOINT, { method: "HEAD" }),
  );
  const options = await route.OPTIONS(
    new Request(ENDPOINT, { method: "OPTIONS" }),
  );

  assert.equal(head.status, 405);
  assert.equal(head.headers.get("cache-control"), "no-store");
  assert.equal(await head.text(), "");
  assert.equal(options.status, 405);
  assert.equal(options.headers.get("allow"), "POST");
  assert.equal(options.headers.get("cache-control"), "no-store");
});

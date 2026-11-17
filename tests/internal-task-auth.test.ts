import assert from "node:assert/strict";
import test from "node:test";

import { authenticateInternalTaskRequest } from "../src/lib/internal-task-auth";

const validSecret = Buffer.alloc(32, 0x5a).toString("base64url");
const otherSecret = Buffer.alloc(32, 0x6b).toString("base64url");
const shortSecret = Buffer.alloc(31, 0x5a).toString("base64url");
const differentlyCasedSecret = validSecret.replace(
  /[A-Za-z]/,
  (character) =>
    character === character.toLowerCase()
      ? character.toUpperCase()
      : character.toLowerCase(),
);

function authenticate(
  authorization: string | null | undefined,
  cronSecret: string | undefined = validSecret,
) {
  return authenticateInternalTaskRequest({
    authorization,
    env: { CRON_SECRET: cronSecret },
  });
}

test("authorizes the configured bearer token", () => {
  assert.deepEqual(authenticate(`Bearer ${validSecret}`), {
    status: "AUTHORIZED",
    error: null,
  });
});

for (const scheme of ["Bearer", "bearer", "BEARER", "BeArEr"]) {
  test(`accepts the ${scheme} authentication scheme`, () => {
    assert.deepEqual(authenticate(`${scheme} ${validSecret}`), {
      status: "AUTHORIZED",
      error: null,
    });
  });
}

for (const [label, spaces] of [
  ["one ASCII space", " "],
  ["two ASCII spaces", "  "],
  ["several ASCII spaces", "     "],
] as const) {
  test(`accepts ${label} after the Bearer scheme`, () => {
    assert.deepEqual(authenticate(`Bearer${spaces}${validSecret}`), {
      status: "AUTHORIZED",
      error: null,
    });
  });
}

test("rejects whitespace without a bearer token", () => {
  assert.deepEqual(authenticate("bearer     "), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects a tab between the scheme and token", () => {
  assert.deepEqual(authenticate(`bearer\t${validSecret}`), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("keeps the bearer token case-sensitive", () => {
  assert.notEqual(differentlyCasedSecret, validSecret);
  assert.deepEqual(authenticate(`bearer ${differentlyCasedSecret}`), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects non-Bearer authentication schemes", () => {
  assert.deepEqual(authenticate(`Basic ${validSecret}`), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects comma-concatenated bearer tokens", () => {
  assert.deepEqual(
    authenticate(`Bearer ${validSecret}, Bearer ${validSecret}`),
    {
      status: "UNAUTHORIZED",
      error: "CRON_TOKEN_INVALID",
    },
  );
});

test("rejects content before the bearer token", () => {
  assert.deepEqual(authenticate(`Bearer prefix${validSecret}`), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects content after the bearer token", () => {
  assert.deepEqual(authenticate(`Bearer ${validSecret} suffix`), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects additional credential fields", () => {
  assert.deepEqual(authenticate(`Bearer ${validSecret};scope=all`), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects an incorrect bearer token", () => {
  assert.deepEqual(authenticate(`Bearer ${otherSecret}`), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects a missing authorization header", () => {
  assert.deepEqual(authenticate(null), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_MISSING",
  });
});

test("rejects an authorization value without the Bearer prefix", () => {
  assert.deepEqual(authenticate(validSecret), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects an empty bearer token", () => {
  assert.deepEqual(authenticate("Bearer "), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects a token whose encoded length differs", () => {
  assert.deepEqual(authenticate("Bearer abc"), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("rejects an overlong bearer token before hashing", () => {
  assert.deepEqual(authenticate(`Bearer ${"a".repeat(513)}`), {
    status: "UNAUTHORIZED",
    error: "CRON_TOKEN_INVALID",
  });
});

test("reports a missing CRON_SECRET as a configuration error", () => {
  assert.deepEqual(
    authenticateInternalTaskRequest({
      authorization: `Bearer ${validSecret}`,
      env: {},
    }),
    {
      status: "CONFIGURATION_ERROR",
      error: "CRON_SECRET_MISSING",
    },
  );
});

test("reports an empty CRON_SECRET as invalid", () => {
  assert.deepEqual(authenticate(`Bearer ${validSecret}`, ""), {
    status: "CONFIGURATION_ERROR",
    error: "CRON_SECRET_INVALID",
  });
});

test("reports a malformed CRON_SECRET as invalid", () => {
  assert.deepEqual(authenticate(`Bearer ${validSecret}`, `${validSecret}=`), {
    status: "CONFIGURATION_ERROR",
    error: "CRON_SECRET_INVALID",
  });
});

test("reports a CRON_SECRET below 32 decoded bytes as invalid", () => {
  assert.deepEqual(authenticate(`Bearer ${shortSecret}`, shortSecret), {
    status: "CONFIGURATION_ERROR",
    error: "CRON_SECRET_INVALID",
  });
});

test("does not fall back to AUTH_SECRET", () => {
  assert.deepEqual(
    authenticateInternalTaskRequest({
      authorization: `Bearer ${validSecret}`,
      env: { AUTH_SECRET: validSecret },
    }),
    {
      status: "CONFIGURATION_ERROR",
      error: "CRON_SECRET_MISSING",
    },
  );
});

test("does not expose the configured secret in an error result", () => {
  const sensitiveSecret = "sensitive-not-base64url!";
  const result = authenticate(`Bearer ${validSecret}`, sensitiveSecret);

  assert.deepEqual(result, {
    status: "CONFIGURATION_ERROR",
    error: "CRON_SECRET_INVALID",
  });
  assert.equal(JSON.stringify(result).includes(sensitiveSecret), false);
});

test("evaluates each request token independently", () => {
  assert.equal(
    authenticate(`Bearer ${validSecret}`).status,
    "AUTHORIZED",
  );
  assert.equal(
    authenticate(`Bearer ${otherSecret}`).status,
    "UNAUTHORIZED",
  );
  assert.equal(
    authenticate(`Bearer ${validSecret}`).status,
    "AUTHORIZED",
  );
});

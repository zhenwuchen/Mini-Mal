import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

const MIN_CRON_SECRET_BYTES = 32;
const MAX_BEARER_TOKEN_LENGTH = 512;
const BEARER_SCHEME = "bearer";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const SHA256_BYTES = 32;

export type InternalTaskAuthErrorCode =
  | "CRON_SECRET_MISSING"
  | "CRON_SECRET_INVALID"
  | "CRON_TOKEN_MISSING"
  | "CRON_TOKEN_INVALID";

type CronConfigurationErrorCode = Extract<
  InternalTaskAuthErrorCode,
  "CRON_SECRET_MISSING" | "CRON_SECRET_INVALID"
>;

type CronTokenErrorCode = Extract<
  InternalTaskAuthErrorCode,
  "CRON_TOKEN_MISSING" | "CRON_TOKEN_INVALID"
>;

export type InternalTaskAuthResult =
  | {
      status: "AUTHORIZED";
      error: null;
    }
  | {
      status: "UNAUTHORIZED";
      error: CronTokenErrorCode;
    }
  | {
      status: "CONFIGURATION_ERROR";
      error: CronConfigurationErrorCode;
    };

type CronSecretEnvironment = Readonly<
  Record<string, string | undefined> & {
    CRON_SECRET?: string;
  }
>;

type AuthenticateInternalTaskRequestInput = {
  authorization: string | null | undefined;
  env?: CronSecretEnvironment;
};

function isValidCronSecret(secret: string): boolean {
  if (
    secret.length === 0 ||
    secret.length > MAX_BEARER_TOKEN_LENGTH ||
    !BASE64URL_PATTERN.test(secret)
  ) {
    return false;
  }

  const decoded = Buffer.from(secret, "base64url");

  return (
    decoded.byteLength >= MIN_CRON_SECRET_BYTES &&
    decoded.toString("base64url") === secret
  );
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function parseBearerToken(authorization: string): string | null {
  const schemeSeparatorIndex = authorization.indexOf(" ");

  if (schemeSeparatorIndex === -1) {
    return null;
  }

  const scheme = authorization.slice(0, schemeSeparatorIndex);

  if (scheme.toLowerCase() !== BEARER_SCHEME) {
    return null;
  }

  let tokenStartIndex = schemeSeparatorIndex;

  while (authorization.charCodeAt(tokenStartIndex) === 0x20) {
    tokenStartIndex += 1;
  }

  if (
    tokenStartIndex >= authorization.length ||
    authorization.length - tokenStartIndex > MAX_BEARER_TOKEN_LENGTH
  ) {
    return null;
  }

  const token = authorization.slice(tokenStartIndex);

  return BASE64URL_PATTERN.test(token) ? token : null;
}

export function authenticateInternalTaskRequest({
  authorization,
  env = process.env,
}: AuthenticateInternalTaskRequestInput): InternalTaskAuthResult {
  const cronSecret = env.CRON_SECRET;

  if (cronSecret === undefined) {
    return {
      status: "CONFIGURATION_ERROR",
      error: "CRON_SECRET_MISSING",
    };
  }

  if (!isValidCronSecret(cronSecret)) {
    return {
      status: "CONFIGURATION_ERROR",
      error: "CRON_SECRET_INVALID",
    };
  }

  if (authorization === null || authorization === undefined) {
    return {
      status: "UNAUTHORIZED",
      error: "CRON_TOKEN_MISSING",
    };
  }

  const candidateToken = parseBearerToken(authorization);

  if (candidateToken === null) {
    return {
      status: "UNAUTHORIZED",
      error: "CRON_TOKEN_INVALID",
    };
  }

  const candidateDigest = digest(candidateToken);
  const secretDigest = digest(cronSecret);

  if (
    candidateDigest.byteLength !== SHA256_BYTES ||
    secretDigest.byteLength !== SHA256_BYTES ||
    !timingSafeEqual(candidateDigest, secretDigest)
  ) {
    return {
      status: "UNAUTHORIZED",
      error: "CRON_TOKEN_INVALID",
    };
  }

  return {
    status: "AUTHORIZED",
    error: null,
  };
}

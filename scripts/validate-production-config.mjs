import {
  isAbsolute as isPosixAbsolute,
  posix,
} from "node:path";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MIN_CRON_SECRET_BYTES = 32;
const MAX_BEARER_TOKEN_LENGTH = 512;
const MIN_AUTH_SECRET_LENGTH = 32;
const PLACEHOLDER_PATTERN =
  /(change[-_ ]?me|placeholder|replace[-_ ]?me|your[-_ ]?secret|example|todo|password|test[-_ ]?secret)/i;

function isValidCronSecret(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_BEARER_TOKEN_LENGTH ||
    !BASE64URL_PATTERN.test(value)
  ) {
    return false;
  }

  const decoded = Buffer.from(value, "base64url");

  return (
    decoded.byteLength >= MIN_CRON_SECRET_BYTES &&
    decoded.toString("base64url") === value
  );
}

function parseAbsoluteSQLitePath(value) {
  if (typeof value !== "string" || !value.startsWith("file:")) {
    return null;
  }

  let pathPart = value.slice("file:".length);
  const queryIndex = pathPart.indexOf("?");

  if (queryIndex >= 0) {
    pathPart = pathPart.slice(0, queryIndex);
  }

  if (pathPart.startsWith("///")) {
    pathPart = pathPart.slice(2);
  } else if (pathPart.startsWith("//")) {
    return null;
  }

  if (!pathPart || pathPart.includes("\0")) {
    return null;
  }

  try {
    pathPart = decodeURIComponent(pathPart);
  } catch {
    return null;
  }

  if (!isPosixAbsolute(pathPart)) {
    return null;
  }

  return posix.normalize(pathPart);
}

export function validateProductionConfig(environment = process.env) {
  const errors = [];
  const databasePath = parseAbsoluteSQLitePath(
    environment.DATABASE_URL,
  );

  if (environment.NODE_ENV !== "production") {
    errors.push("NODE_ENV must be production.");
  }

  if (databasePath === null) {
    errors.push(
      "DATABASE_URL must be an absolute SQLite file URL.",
    );
  } else {
    const segments = databasePath.split("/");

    if (
      segments.at(-1) === "dev.db" &&
      segments.at(-2) === "prisma"
    ) {
      errors.push(
        "DATABASE_URL must not point to the development database.",
      );
    }
  }

  if (!isValidCronSecret(environment.CRON_SECRET)) {
    errors.push(
      "CRON_SECRET must match the internal task authentication rules.",
    );
  }

  const rawAuthSecret =
    typeof environment.AUTH_SECRET === "string"
      ? environment.AUTH_SECRET
      : "";
  const authSecret = rawAuthSecret.trim();

  if (
    rawAuthSecret !== authSecret ||
    authSecret.length < MIN_AUTH_SECRET_LENGTH ||
    PLACEHOLDER_PATTERN.test(authSecret)
  ) {
    errors.push(
      "AUTH_SECRET must be present, non-placeholder, and at least 32 characters.",
    );
  }

  if (environment.AUTH_TRUST_HOST !== "true") {
    errors.push(
      "AUTH_TRUST_HOST must be true for the trusted production proxy.",
    );
  }

  for (const publicSecretName of [
    "NEXT_PUBLIC_CRON_SECRET",
    "NEXT_PUBLIC_AUTH_SECRET",
    "NEXT_PUBLIC_SECRET",
  ]) {
    if (environment[publicSecretName]) {
      errors.push(`${publicSecretName} must not be configured.`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }

  return (
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  );
}

if (isDirectExecution()) {
  const result = validateProductionConfig();

  if (result.ok) {
    console.log(
      "Production configuration validation passed. Values were not displayed.",
    );
  } else {
    console.error("Production configuration validation failed:");

    for (const error of result.errors) {
      console.error(`- ${error}`);
    }

    process.exitCode = 1;
  }
}

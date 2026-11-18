import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, normalize } from "node:path";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

import { createIsolatedStorefrontTestDatabase } from "./helpers/test-database";

function databasePathFromUrl(value: string) {
  assert.match(value, /^file:/);
  return normalize(value.slice("file:".length));
}

test("uses one shared isolated test database under the OS temp directory", () => {
  const databaseUrl = process.env.DATABASE_URL;
  const runId = process.env.MINI_MALL_TEST_RUN_ID;

  assert.ok(databaseUrl, "DATABASE_URL must be set by the test runner");
  assert.ok(runId, "MINI_MALL_TEST_RUN_ID must be set by the test runner");

  const databasePath = databasePathFromUrl(databaseUrl);
  assert.equal(isAbsolute(databasePath), true);
  assert.doesNotMatch(databasePath.toLowerCase(), /prisma[\\/]dev\.db$/);
  assert.match(databasePath, /mini-mall-test-run-/);
  assert.ok(databasePath.endsWith(`${runId}.db`));
});

test("Prisma resolves the isolated database file from DATABASE_URL", async () => {
  const prisma = new PrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ name: string; file: string }>
    >("PRAGMA database_list");
    const main = rows.find((row) => row.name === "main");

    assert.ok(main);
    assert.doesNotMatch(main.file.toLowerCase(), /prisma[\\/]dev\.db$/);
    assert.match(main.file, /mini-mall-test-run-/);
  } finally {
    await prisma.$disconnect();
  }
});

test("helper-created test clients reuse the shared isolated database", async () => {
  const sharedDatabaseUrl = process.env.DATABASE_URL;
  const markerClient = new PrismaClient();
  const database = createIsolatedStorefrontTestDatabase();

  assert.ok(sharedDatabaseUrl);
  assert.equal(database.databaseUrl, sharedDatabaseUrl);

  try {
    await markerClient.category.create({
      data: {
        name: "Shared Database Marker",
        slug: `shared-database-marker-${Date.now()}`,
      },
    });
    await database.initialize();
    assert.equal(
      await database.prisma.category.count({
        where: { name: "Shared Database Marker" },
      }),
      0,
    );
    const rows = await database.prisma.$queryRawUnsafe<
      Array<{ name: string; file: string }>
    >("PRAGMA database_list");
    const main = rows.find((row) => row.name === "main");

    assert.ok(main);
    assert.doesNotMatch(main.file.toLowerCase(), /prisma[\\/]dev\.db$/);
    assert.match(main.file, /mini-mall-test-run-/);
  } finally {
    await database.cleanup();
    await markerClient.$disconnect();
  }
});

test("does not alter the development database during the test run", () => {
  const devDatabasePath = process.env.MINI_MALL_DEV_DATABASE_PATH;
  const expectedHash = process.env.MINI_MALL_DEV_DATABASE_HASH_BEFORE;
  const existedBefore =
    process.env.MINI_MALL_DEV_DATABASE_EXISTED_BEFORE === "true";

  assert.ok(devDatabasePath);

  if (existedBefore) {
    assert.ok(expectedHash);

    const currentHash = createHash("sha256")
      .update(readFileSync(devDatabasePath))
      .digest("hex");

    assert.equal(currentHash, expectedHash);
    return;
  }

  assert.equal(existsSync(devDatabasePath), false);
});

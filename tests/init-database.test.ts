import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { PrismaClient } from "@prisma/client";

test("initializes a fresh database and is idempotent", async () => {
  const directory = mkdtempSync(join(tmpdir(), "mini-mall-init-test-"));
  const databasePath = join(directory, "init-test.db");
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
  const scriptPath = resolve("scripts/init-database.mjs");
  const prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });

  try {
    for (let run = 1; run <= 2; run += 1) {
      const result = spawnSync(
        process.execPath,
        ["--no-warnings", scriptPath],
        {
          cwd: resolve("."),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
          },
          encoding: "utf8",
        },
      );

      assert.equal(
        result.status,
        0,
        `initialization run ${run} failed: ${result.stderr}`,
      );
    }

    const tables = await prisma.$queryRawUnsafe<
      Array<{ name: string }>
    >(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = tables.map((row) => row.name);
    assert.ok(names.includes("_prisma_migrations"));
    assert.ok(names.includes("User"));
    assert.ok(names.includes("Order"));
    assert.ok(names.includes("Payment"));

    const migrations = await prisma.$queryRawUnsafe<
      Array<{ migration_name: string; finished_at: number | null }>
    >(
      'SELECT "migration_name", "finished_at" FROM "_prisma_migrations" ORDER BY "started_at"',
    );
    assert.equal(migrations.length, 2);
    assert.deepEqual(
      migrations.map((migration) => migration.migration_name),
      [
        "20261116043713_init",
        "20261116135659_add_order_address_snapshots",
      ],
    );
    assert.ok(migrations.every((migration) => migration.finished_at !== null));
  } finally {
    await prisma.$disconnect();
    rmSync(directory, { recursive: true, force: true });
  }
});

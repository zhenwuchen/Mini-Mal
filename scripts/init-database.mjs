import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const projectRoot = resolve(import.meta.dirname, "..");
const prismaDirectory = join(projectRoot, "prisma");
const migrationsDirectory = join(prismaDirectory, "migrations");
const migrationTableSql = `
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "checksum" TEXT NOT NULL,
    "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL,
    "logs" TEXT,
    "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
  )
`;

function loadEnvironmentFile(filePath) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match || process.env[match[1]] !== undefined) continue;

    const raw = match[2].trim();
    const value =
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
        ? raw.slice(1, -1)
        : raw;

    process.env[match[1]] = value;
  }
}

loadEnvironmentFile(join(projectRoot, ".env"));
loadEnvironmentFile(join(projectRoot, ".env.local"));

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.startsWith("file:")) {
  throw new Error("DATABASE_URL must be a SQLite file: URL");
}

const rawDatabasePath = decodeURIComponent(databaseUrl.slice("file:".length));
const databasePath = isAbsolute(rawDatabasePath)
  ? rawDatabasePath
  : resolve(prismaDirectory, rawDatabasePath);

mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);

try {
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(migrationTableSql);

  const migrationDirectories = readdirSync(migrationsDirectory, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  let appliedCount = 0;

  for (const migrationName of migrationDirectories) {
    const sqlPath = join(
      migrationsDirectory,
      migrationName,
      "migration.sql",
    );
    const sql = readFileSync(sqlPath);
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = database
      .prepare(
        `SELECT "checksum", "finished_at", "rolled_back_at"
         FROM "_prisma_migrations"
         WHERE "migration_name" = ?`,
      )
      .get(migrationName);

    if (existing) {
      if (existing.checksum !== checksum) {
        throw new Error(
          `Migration checksum mismatch: ${migrationName}`,
        );
      }

      if (
        existing.finished_at === null ||
        existing.rolled_back_at !== null
      ) {
        throw new Error(
          `Migration is incomplete or rolled back: ${migrationName}`,
        );
      }

      continue;
    }

    const startedAt = Date.now();

    database.exec("BEGIN IMMEDIATE");

    try {
      database.exec(sql.toString("utf8"));
      database
        .prepare(
          `INSERT INTO "_prisma_migrations" (
             "id", "checksum", "finished_at", "migration_name",
             "logs", "rolled_back_at", "started_at",
             "applied_steps_count"
           ) VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)`,
        )
        .run(
          randomUUID(),
          checksum,
          Date.now(),
          migrationName,
          startedAt,
        );
      database.exec("COMMIT");
      appliedCount += 1;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  console.log(
    `Mini Mal1 database ready at ${databasePath} (${appliedCount} migration(s) applied).`,
  );
} finally {
  database.close();
}

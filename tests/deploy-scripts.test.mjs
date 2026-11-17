import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateProductionConfig,
} from "../scripts/validate-production-config.mjs";
import {
  parseBackupArguments,
  runBackup,
} from "../scripts/sqlite-backup.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const validationScript = join(
  projectRoot,
  "scripts",
  "validate-production-config.mjs",
);
const validCronSecret = Buffer.alloc(32, 0x51).toString("base64url");
const validAuthSecret = "A".repeat(64);

function validProductionEnvironment() {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "file:/var/lib/mini-mall/app.db",
    AUTH_SECRET: validAuthSecret,
    AUTH_TRUST_HOST: "true",
    CRON_SECRET: validCronSecret,
  };
}

function createTemporaryDeploymentFiles() {
  const root = mkdtempSync(join(tmpdir(), "mini-mall-deploy-test-"));
  const databaseDirectory = join(root, "database");
  const backupDirectory = join(root, "backups");

  writeFileSync(join(root, ".keep"), "", "utf8");
  rmSync(join(root, ".keep"), { force: true });

  const databasePath = join(databaseDirectory, "app.db");

  return {
    root,
    databaseDirectory,
    databasePath,
    backupDirectory,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("accepts a production SQLite configuration without requiring the database to exist", () => {
  const result = validateProductionConfig(
    validProductionEnvironment(),
  );

  assert.deepEqual(result, { ok: true, errors: [] });
});

test("rejects relative SQLite paths", () => {
  const environment = validProductionEnvironment();
  environment.DATABASE_URL = "file:./prisma/dev.db";

  const result = validateProductionConfig(environment);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /DATABASE_URL/);
});

test("rejects the development database path", () => {
  const environment = validProductionEnvironment();
  environment.DATABASE_URL =
    "file:/srv/mini-mall/prisma/dev.db";

  const result = validateProductionConfig(environment);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /development database/i);
});

test("rejects a non-SQLite database URL", () => {
  const environment = validProductionEnvironment();
  environment.DATABASE_URL =
    "postgresql://user:password@example.invalid/app";

  const result = validateProductionConfig(environment);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /SQLite file URL/);
});

test("validates CRON_SECRET with the internal task authentication rules", () => {
  for (const invalidSecret of [
    "",
    "short",
    `${validCronSecret}=`,
    Buffer.alloc(31, 0x51).toString("base64url"),
  ]) {
    const environment = validProductionEnvironment();
    environment.CRON_SECRET = invalidSecret;

    const result = validateProductionConfig(environment);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /CRON_SECRET/);
  }
});

test("rejects missing or placeholder authentication values", () => {
  for (const authSecret of [
    undefined,
    "",
    "change-me",
    "placeholder-secret-value",
    "short-secret",
  ]) {
    const environment = validProductionEnvironment();
    environment.AUTH_SECRET = authSecret;

    const result = validateProductionConfig(environment);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /AUTH_SECRET/);
  }
});

test("rejects production secrets exposed through NEXT_PUBLIC variables", () => {
  const environment = validProductionEnvironment();
  environment.NEXT_PUBLIC_CRON_SECRET = validCronSecret;

  const result = validateProductionConfig(environment);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /NEXT_PUBLIC_CRON_SECRET/);
});

test("rejects the generic NEXT_PUBLIC_SECRET variable", () => {
  const environment = validProductionEnvironment();
  environment.NEXT_PUBLIC_SECRET = "must-not-be-public";

  const result = validateProductionConfig(environment);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /NEXT_PUBLIC_SECRET/);
});

test("configuration CLI returns zero for valid input without printing secrets", () => {
  const result = spawnSync(
    process.execPath,
    [validationScript],
    {
      cwd: projectRoot,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        DATABASE_URL: "file:/var/lib/mini-mall/app.db",
        AUTH_SECRET: validAuthSecret,
        AUTH_TRUST_HOST: "true",
        CRON_SECRET: validCronSecret,
      },
      encoding: "utf8",
    },
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.equal(result.status, 0);
  assert.doesNotMatch(output, new RegExp(validAuthSecret));
  assert.doesNotMatch(output, new RegExp(validCronSecret));
});

test("configuration CLI returns non-zero for invalid input without printing secrets", () => {
  const result = spawnSync(
    process.execPath,
    [validationScript],
    {
      cwd: projectRoot,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "production",
        DATABASE_URL: "file:./prisma/dev.db",
        AUTH_SECRET: validAuthSecret,
        AUTH_TRUST_HOST: "true",
        CRON_SECRET: validCronSecret,
      },
      encoding: "utf8",
    },
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /DATABASE_URL/);
  assert.doesNotMatch(output, new RegExp(validAuthSecret));
  assert.doesNotMatch(output, new RegExp(validCronSecret));
});

test("backup arguments require absolute database and output paths", () => {
  assert.throws(
    () =>
      parseBackupArguments([
        "--database",
        "relative.db",
        "--output-dir",
        "/var/backups/mini-mall",
      ]),
    /absolute/i,
  );

  assert.throws(
    () =>
      parseBackupArguments([
        "--database",
        "/var/lib/mini-mall/app.db",
        "--output-dir",
        "backups",
      ]),
    /absolute/i,
  );
});

test("backup refuses an output directory inside the database directory", async () => {
  const temporary = createTemporaryDeploymentFiles();

  try {
    const result = await runBackup({
      databasePath: temporary.databasePath,
      outputDirectory: join(
        temporary.databaseDirectory,
        "backups",
      ),
      sqliteCommand: "sqlite3",
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /outside/i);
  } finally {
    temporary.cleanup();
  }
});

test("backup fails safely when the sqlite3 command is unavailable", async () => {
  const temporary = createTemporaryDeploymentFiles();

  try {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(temporary.databaseDirectory, { recursive: true });
    mkdirSync(temporary.backupDirectory, { recursive: true });
    writeFileSync(temporary.databasePath, "not-a-database", "utf8");

    const result = await runBackup({
      databasePath: temporary.databasePath,
      outputDirectory: temporary.backupDirectory,
      sqliteCommand: "definitely-not-an-installed-sqlite-command",
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /sqlite3/i);
  } finally {
    temporary.cleanup();
  }
});

test("backup removes partial output when the sqlite command fails", async () => {
  const temporary = createTemporaryDeploymentFiles();

  try {
    const { mkdirSync, readdirSync } = await import("node:fs");
    mkdirSync(temporary.databaseDirectory, { recursive: true });
    mkdirSync(temporary.backupDirectory, { recursive: true });
    writeFileSync(temporary.databasePath, "not-a-database", "utf8");

    const result = await runBackup({
      databasePath: temporary.databasePath,
      outputDirectory: temporary.backupDirectory,
      sqliteCommand: process.execPath,
    });

    assert.equal(result.ok, false);
    assert.deepEqual(readdirSync(temporary.backupDirectory), []);
  } finally {
    temporary.cleanup();
  }
});

test("deployment scripts preserve safe build and migration commands", () => {
  const packageJson = JSON.parse(
    readFileSync(join(projectRoot, "package.json"), "utf8"),
  );

  assert.equal(packageJson.engines.node, ">=22.19.0 <23");
  assert.equal(
    packageJson.scripts.build,
    "npm run db:generate && next build",
  );
  assert.equal(
    packageJson.scripts["start:production"],
    "node scripts/start-production.mjs",
  );
  assert.equal(
    packageJson.scripts["db:migrate:deploy"],
    "prisma migrate deploy --schema prisma/schema.prisma",
  );
  assert.equal(packageJson.scripts["db:migrate"], "prisma migrate dev");
  assert.doesNotMatch(packageJson.scripts.build, /migrate|seed/i);
});

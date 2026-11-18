import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const developmentDatabasePath = join(
  projectRoot,
  "prisma",
  "dev.db",
);
const runId = randomUUID();
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "mini-mall-test-run-"),
);
const databasePath = join(temporaryDirectory, `${runId}.db`);
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const suiteCommands = {
  deploy: "_test:deploy-scripts",
  unit: "_test:unit",
  "storefront-navigation": "_test:storefront-navigation",
  "product-detail-navigation": "_test:product-detail-navigation",
  "ui-integration": "_test:ui-integration",
  "internal-task-auth": "_test:internal-task-auth",
  "internal-order-expiration-handler":
    "_test:internal-order-expiration-handler",
  "order-expiration": "_test:order-expiration",
};
const allSuites = Object.keys(suiteCommands);
const requestedSuite = process.argv[2];
const selectedSuites = requestedSuite
  ? [requestedSuite]
  : allSuites;

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function initializeDatabase() {
  process.env.NODE_NO_WARNINGS = "1";
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(databasePath);
  const migrationsDirectory = join(
    projectRoot,
    "prisma",
    "migrations",
  );
  const migrationDirectories = readdirSync(migrationsDirectory, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  try {
    for (const migrationDirectory of migrationDirectories) {
      database.exec(
        readFileSync(
          join(migrationsDirectory, migrationDirectory, "migration.sql"),
          "utf8",
        ),
      );
    }
  } finally {
    database.close();
  }
}

function runSuite(script) {
  const npmExecPath = process.env.npm_execpath;

  if (!npmExecPath) {
    throw new Error("npm_execpath is unavailable; run this script through npm");
  }

  console.log(`\n[test-runner] ${script}`);
  return spawnSync(
    process.execPath,
    [npmExecPath, "run", script],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
}

if (selectedSuites.some((suite) => !suiteCommands[suite])) {
  throw new Error(
    `Unknown test suite: ${requestedSuite}. Expected one of: ${allSuites.join(", ")}`,
  );
}

const developmentDatabaseExistedBefore = existsSync(
  developmentDatabasePath,
);
const developmentDatabaseHashBefore =
  developmentDatabaseExistedBefore
    ? sha256File(developmentDatabasePath)
    : null;
let failed = false;

try {
  await initializeDatabase();
  process.env.DATABASE_URL = databaseUrl;
  process.env.MINI_MALL_TEST_RUN_ID = runId;
  process.env.MINI_MALL_DEV_DATABASE_PATH = developmentDatabasePath;
  process.env.MINI_MALL_DEV_DATABASE_HASH_BEFORE =
    developmentDatabaseHashBefore ?? "";
  process.env.MINI_MALL_DEV_DATABASE_EXISTED_BEFORE = String(
    developmentDatabaseExistedBefore,
  );

  console.log(`[test-runner] DATABASE_URL=${databaseUrl}`);

  for (const suite of selectedSuites) {
    const result = runSuite(suiteCommands[suite]);

    if (result.error) {
      throw result.error;
    }

    if (result.status !== 0) {
      failed = true;
      break;
    }
  }
} finally {
  const developmentDatabaseExistedAfter = existsSync(
    developmentDatabasePath,
  );
  const developmentDatabaseHashAfter =
    developmentDatabaseExistedAfter
      ? sha256File(developmentDatabasePath)
      : null;

  if (
    developmentDatabaseExistedAfter !==
    developmentDatabaseExistedBefore
  ) {
    failed = true;
    console.error(
      "[test-runner] prisma/dev.db existence changed during the test run",
    );
  } else if (
    developmentDatabaseExistedBefore &&
    developmentDatabaseHashAfter !== developmentDatabaseHashBefore
  ) {
    failed = true;
    console.error(
      "[test-runner] prisma/dev.db changed during the test run",
    );
  } else {
    console.log("[test-runner] prisma/dev.db hash unchanged");
  }

  rmSync(temporaryDirectory, {
    recursive: true,
    force: true,
  });
}

process.exitCode = failed ? 1 : 0;

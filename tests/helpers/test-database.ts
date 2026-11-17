import {
  readdirSync,
  readFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  join,
  resolve,
  sep,
} from "node:path";

import { PrismaClient } from "@prisma/client";

export type TestDatabase = {
  prisma: PrismaClient;
  databaseUrl: string;
  initialize: () => Promise<void>;
  cleanup: () => Promise<void>;
};

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];

    if (inLineComment) {
      current += character;
      if (character === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += character;
      if (character === "*" && next === "/") {
        current += next;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (quote) {
      current += character;
      if (character === quote) {
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === "-" && next === "-") {
      current += character + next;
      index += 1;
      inLineComment = true;
      continue;
    }

    if (character === "/" && next === "*") {
      current += character + next;
      index += 1;
      inBlockComment = true;
      continue;
    }

    if (character === "'" || character === '"') {
      current += character;
      quote = character;
      continue;
    }

    if (character === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(statement);
      }
      current = "";
      continue;
    }

    current += character;
  }

  const finalStatement = current.trim();
  if (finalStatement) {
    statements.push(finalStatement);
  }

  return statements;
}

async function loadMigrations(
  prisma: PrismaClient,
  migrationsDirectory: string,
) {
  const migrationDirectories = readdirSync(migrationsDirectory, {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationDirectory of migrationDirectories) {
    const sql = readFileSync(
      join(migrationsDirectory, migrationDirectory, "migration.sql"),
      "utf8",
    );

    for (const statement of splitSqlStatements(sql)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }
}

function assertSafeTemporaryDirectory(
  directory: string,
  expectedPrefix: string,
) {
  const resolvedDirectory = resolve(directory);
  const temporaryRoot = `${resolve(tmpdir())}${sep}`;

  if (
    !resolvedDirectory.startsWith(temporaryRoot) ||
    !basename(resolvedDirectory).startsWith(expectedPrefix)
  ) {
    throw new Error("Refusing to remove an unsafe test directory");
  }
}

function createIsolatedTestDatabase({
  directoryPrefix,
  databaseFileName,
}: {
  directoryPrefix: string;
  databaseFileName: string;
}): TestDatabase {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), directoryPrefix),
  );
  const databasePath = join(temporaryDirectory, databaseFileName);
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
  const projectRoot = process.cwd();
  const prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
  let cleaned = false;
  let initialized = false;

  async function cleanup() {
    if (cleaned) {
      return;
    }

    cleaned = true;
    await prisma.$disconnect();
    assertSafeTemporaryDirectory(temporaryDirectory, directoryPrefix);
    rmSync(temporaryDirectory, {
      recursive: true,
      force: true,
    });
  }

  async function initialize() {
    if (initialized) {
      return;
    }

    try {
      await loadMigrations(
        prisma,
        join(projectRoot, "prisma", "migrations"),
      );
      initialized = true;
    } catch (error) {
      await cleanup();
      throw error;
    }
  }

  return {
    prisma,
    databaseUrl,
    initialize,
    cleanup,
  };
}

export function createIsolatedPaymentTestDatabase(): TestDatabase {
  return createIsolatedTestDatabase({
    directoryPrefix: "mini-mall-payment-",
    databaseFileName: "payment-test.db",
  });
}

export function createIsolatedOrderCancelTestDatabase(): TestDatabase {
  return createIsolatedTestDatabase({
    directoryPrefix: "mini-mall-order-cancel-",
    databaseFileName: "order-cancel-test.db",
  });
}

export function createIsolatedOrderCreateTestDatabase(): TestDatabase {
  return createIsolatedTestDatabase({
    directoryPrefix: "mini-mall-order-create-",
    databaseFileName: "order-create-test.db",
  });
}

export function createIsolatedOrderExpirationTestDatabase(): TestDatabase {
  return createIsolatedTestDatabase({
    directoryPrefix: "mini-mall-order-expiration-",
    databaseFileName: "order-expiration-test.db",
  });
}

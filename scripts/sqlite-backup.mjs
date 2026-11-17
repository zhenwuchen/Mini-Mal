import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  closeSync,
  createReadStream,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function usageError(message) {
  return new Error(`${message}\n${backupUsage()}`);
}

function backupUsage() {
  return [
    "Usage:",
    "  node scripts/sqlite-backup.mjs --database <absolute-path> --output-dir <absolute-path>",
  ].join("\n");
}

export function parseBackupArguments(arguments_) {
  const values = {
    databasePath: null,
    outputDirectory: null,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument !== "--database" && argument !== "--output-dir") {
      throw usageError(`Unknown argument: ${argument}`);
    }

    const value = arguments_[index + 1];

    if (!value || value.startsWith("--")) {
      throw usageError(`Missing value for ${argument}`);
    }

    if (argument === "--database") {
      values.databasePath = value;
    } else {
      values.outputDirectory = value;
    }

    index += 1;
  }

  if (!values.databasePath || !values.outputDirectory) {
    throw usageError("Both --database and --output-dir are required.");
  }

  if (!isAbsolute(values.databasePath)) {
    throw usageError("The database path must be absolute.");
  }

  if (!isAbsolute(values.outputDirectory)) {
    throw usageError("The output directory must be absolute.");
  }

  return {
    databasePath: resolve(values.databasePath),
    outputDirectory: resolve(values.outputDirectory),
  };
}

function commandIsAvailable(command) {
  const result = spawnSync(command, ["-version"], {
    encoding: "utf8",
    timeout: 5_000,
  });

  return !result.error && result.status === 0;
}

function quoteDotCommandPath(filePath) {
  return `"${filePath
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')}"`;
}

function timestampForBackup(now) {
  return now
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace(/\.\d{3}Z$/, "Z");
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);

  for await (const chunk of stream) {
    hash.update(chunk);
  }

  return hash.digest("hex");
}

function removeFileIfPresent(filePath) {
  if (!filePath) {
    return;
  }

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Cleanup failures must not hide the original backup result.
  }
}

export async function runBackup({
  databasePath,
  outputDirectory,
  sqliteCommand = process.env.SQLITE3_BIN || "sqlite3",
  now = new Date(),
  createUniqueSuffix = () => randomUUID().slice(0, 8),
}) {
  let temporaryFile = null;
  let finalFile = null;
  let checksumFile = null;
  let committed = false;

  try {
    const resolvedDatabase = resolve(databasePath);
    const resolvedOutput = resolve(outputDirectory);
    const databaseDirectory = dirname(resolvedDatabase);
    const outputRelativeToDatabase = relative(
      databaseDirectory,
      resolvedOutput,
    );

    if (
      outputRelativeToDatabase === "" ||
      (!outputRelativeToDatabase.startsWith("..") &&
        !isAbsolute(outputRelativeToDatabase))
    ) {
      return {
        ok: false,
        error:
          "Backup output directory must be outside the database directory.",
      };
    }

    if (
      !existsSync(resolvedDatabase) ||
      !statSync(resolvedDatabase).isFile()
    ) {
      return {
        ok: false,
        error: "SQLite database file does not exist.",
      };
    }

    if (!commandIsAvailable(sqliteCommand)) {
      return {
        ok: false,
        error:
          "sqlite3 CLI is required but was not found or is not executable.",
      };
    }

    mkdirSync(resolvedOutput, {
      recursive: true,
      mode: 0o700,
    });

    const backupName = `app-${timestampForBackup(now)}-${createUniqueSuffix()}.db`;
    finalFile = join(resolvedOutput, backupName);
    checksumFile = `${finalFile}.sha256`;
    temporaryFile = join(
      resolvedOutput,
      `.${backupName}.partial-${process.pid}`,
    );

    if (existsSync(finalFile) || existsSync(checksumFile)) {
      return {
        ok: false,
        error: "Refusing to overwrite an existing backup file.",
      };
    }

    const placeholder = openSync(temporaryFile, "wx", 0o600);
    closeSync(placeholder);

    const backupCommand = `.backup ${quoteDotCommandPath(temporaryFile)}`;
    const result = spawnSync(
      sqliteCommand,
      [resolvedDatabase, backupCommand],
      {
        encoding: "utf8",
        timeout: 120_000,
      },
    );

    if (result.error || result.status !== 0) {
      return {
        ok: false,
        error: "sqlite3 backup command failed.",
      };
    }

    const backupSize = statSync(temporaryFile).size;

    if (backupSize <= 0) {
      return {
        ok: false,
        error: "SQLite backup file is empty.",
      };
    }

    const checksum = await sha256File(temporaryFile);

    linkSync(temporaryFile, finalFile);
    unlinkSync(temporaryFile);
    temporaryFile = null;

    writeFileSync(
      checksumFile,
      `${checksum}  ${basename(finalFile)}\n`,
      {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      },
    );
    committed = true;

    return {
      ok: true,
      backupFile: finalFile,
      checksumFile,
      bytes: backupSize,
      sha256: checksum,
    };
  } catch {
    return {
      ok: false,
      error: "SQLite backup failed safely.",
    };
  } finally {
    removeFileIfPresent(temporaryFile);

    if (!committed) {
      removeFileIfPresent(finalFile);
      removeFileIfPresent(checksumFile);
    }
  }
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
  let options;

  try {
    options = parseBackupArguments(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : backupUsage(),
    );
    process.exitCode = 2;
  }

  if (options) {
    const result = await runBackup(options);

    if (!result.ok) {
      console.error(result.error);
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result));
    }
  }
}

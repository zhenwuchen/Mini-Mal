import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }

  return (
    pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  );
}

if (isDirectExecution()) {
  const nextBinary = resolve(
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  const child = spawn(
    process.execPath,
    [nextBinary, "start", ...process.argv.slice(2)],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
      stdio: "inherit",
    },
  );

  child.on("error", () => {
    process.exitCode = 1;
  });

  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }
}

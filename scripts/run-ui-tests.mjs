import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const nextBinary = resolve(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const sessionName = `mini-mall-ui-${process.pid}`;

function getAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate a UI test port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });
  });
}

function runCli(args) {
  const npmExecPath = process.env.npm_execpath;

  if (!npmExecPath) {
    throw new Error("npm_execpath is unavailable; run this script through npm");
  }

  return spawnSync(
    process.execPath,
    [
      npmExecPath,
      "exec",
      "--yes",
      "--package=@playwright/cli@0.1.24",
      "--",
      "playwright-cli",
      "--session",
      sessionName,
      ...args,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
}

async function waitForServer(url, server) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(
        `Next.js exited before the UI test server was ready (${server.exitCode})`,
      );
    }

    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // The development server is still starting.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error("Timed out waiting for the UI test server");
}

const port = await getAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [nextBinary, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      MINI_MALL_UI_TEST: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      NO_COLOR: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";

server.stdout.on("data", (chunk) => {
  serverOutput = `${serverOutput}${chunk}`.slice(-20_000);
});
server.stderr.on("data", (chunk) => {
  serverOutput = `${serverOutput}${chunk}`.slice(-20_000);
});

try {
  await waitForServer(`${baseUrl}/ui-test-harness`, server);

  const openResult = runCli(["open", "about:blank"]);

  if (openResult.status !== 0) {
    throw new Error(
      `Unable to open the browser:\n${
        openResult.error?.message ||
        openResult.stderr ||
        openResult.stdout
      }`,
    );
  }

  const browserCode =
    "async (page) => {" +
    ` const baseUrl = ${JSON.stringify(baseUrl)};` +
    ' const response = await fetch(baseUrl + "/ui-test-harness/browser-tests");' +
    " const source = await response.text();" +
    " const runTest = new Function(`return (${source})`)();" +
    " return runTest(page, baseUrl);" +
    " }";
  const testResult = runCli(["--json", "run-code", browserCode]);

  if (testResult.status !== 0) {
    throw new Error(
      `Browser integration test failed:\n${
        testResult.stderr || testResult.stdout
      }`,
    );
  }

  const cliOutput = JSON.parse(testResult.stdout);
  const result =
    typeof cliOutput.result === "string"
      ? JSON.parse(cliOutput.result)
      : cliOutput.result;

  if (!result?.ok) {
    throw new Error(`Unexpected browser test result: ${testResult.stdout}`);
  }

  console.log(
    `[ui-integration] ${result.assertions} assertions passed`,
  );
} catch (error) {
  if (serverOutput) {
    console.error(serverOutput);
  }

  throw error;
} finally {
  try {
    runCli(["close"]);
  } catch {
    // The browser may not have opened successfully.
  }

  if (server.exitCode === null) {
    server.kill();
    await Promise.race([
      once(server, "exit"),
      new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
    ]);
  }
}

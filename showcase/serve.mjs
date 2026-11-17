import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import {
  dirname,
  extname,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

function sendText(response, status, message) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(message);
}

async function resolveRequestFile(requestUrl) {
  const url = new URL(requestUrl, "http://localhost");
  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }

  const requestedPath =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let filePath = resolve(root, requestedPath);
  const rootPrefix = `${root}${sep}`;

  if (filePath !== root && !filePath.startsWith(rootPrefix)) {
    return null;
  }

  const fileInfo = await stat(filePath);

  if (fileInfo.isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  return filePath;
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, {
      Allow: "GET, HEAD",
      "Content-Type": "text/plain; charset=utf-8",
    });
    response.end("Method not allowed");
    return;
  }

  try {
    const filePath = await resolveRequestFile(request.url || "/");

    if (!filePath) {
      sendText(response, 403, "Forbidden");
      return;
    }

    const body = await readFile(filePath);
    const contentType =
      mimeTypes.get(extname(filePath).toLowerCase()) ||
      "application/octet-stream";

    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": body.byteLength,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      sendText(response, 404, "Not found");
      return;
    }

    sendText(response, 500, "Internal server error");
  }
});

server.listen(port, host, () => {
  console.log(`Mini Mal1 showcase: http://${host}:${port}`);
  console.log(`Serving: ${relative(process.cwd(), root) || "."}`);
});

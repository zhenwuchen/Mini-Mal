import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  join,
  relative,
  resolve,
} from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const showcaseRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(showcaseRoot, "..");

function readShowcaseFile(fileName) {
  return readFileSync(join(showcaseRoot, fileName), "utf8");
}

function getAttribute(tag, name) {
  const match = tag.match(
    new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, "i"),
  );

  return match?.[2] ?? null;
}

function isExternalReference(reference) {
  return /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(reference);
}

function resolveLocalReference(reference, sourceFile = "index.html") {
  const withoutFragment = reference.split("#")[0].split("?")[0];

  if (!withoutFragment) {
    return null;
  }

  return resolve(dirname(join(showcaseRoot, sourceFile)), withoutFragment);
}

function assertFile(filePath, label) {
  assert.ok(existsSync(filePath), `${label} does not exist: ${filePath}`);
  assert.ok(statSync(filePath).isFile(), `${label} is not a file: ${filePath}`);
}

function readPngDimensions(filePath) {
  const bytes = readFileSync(filePath);

  assert.equal(bytes.subarray(1, 4).toString("ascii"), "PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

test("ships the required static entry files", () => {
  for (const fileName of [
    "index.html",
    "styles.css",
    "script.js",
    "README.md",
    "vercel.json",
    "serve.mjs",
  ]) {
    assertFile(join(showcaseRoot, fileName), fileName);
  }
});

test("contains every required showcase section and project identity", () => {
  const html = readShowcaseFile("index.html");

  for (const id of [
    "home",
    "features",
    "highlights",
    "architecture",
    "demo",
    "local-run",
  ]) {
    assert.match(html, new RegExp(`\\sid=["']${id}["']`), `missing #${id}`);
  }

  for (const requiredText of [
    "Mini Mal1",
    "基于 Next.js 的全栈微型电商项目",
    "模拟支付",
    "Prisma",
    "SQLite",
    "App Router",
    "Bearer Token",
    "管理员后台",
    "个人资料",
    "服务端分页",
    "快捷加购",
  ]) {
    assert.ok(html.includes(requiredText), `missing text: ${requiredText}`);
  }

  assert.match(html, /<meta\s+name=["']viewport["']/i);
  assert.match(
    html,
    /<link\s+rel=["']icon["'][^>]*href=["'][^"']+["']/i,
    "missing local favicon declaration",
  );
  assert.equal(html.includes("Mini Mall"), false);
});

test("links every local asset and anchor to an existing target", () => {
  const html = readShowcaseFile("index.html");
  const ids = new Set(
    [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map(
      (match) => match[1],
    ),
  );
  const references = [
    ...html.matchAll(/<(?:a|img|link|script|source|video)\b[^>]*>/gi),
  ].map((match) => match[0]);

  for (const tag of references) {
    const reference =
      getAttribute(tag, "href") ??
      getAttribute(tag, "src") ??
      getAttribute(tag, "poster");

    if (!reference || isExternalReference(reference)) {
      continue;
    }

    if (reference.startsWith("#")) {
      assert.ok(
        ids.has(reference.slice(1)),
        `missing anchor target: ${reference}`,
      );
      continue;
    }

    const target = resolveLocalReference(reference);

    if (target) {
      assertFile(target, `referenced by ${tag.slice(0, 80)}`);
    }
  }

  const css = readShowcaseFile("styles.css");

  for (const match of css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)) {
    const reference = match[2];

    if (isExternalReference(reference) || reference.startsWith("#")) {
      continue;
    }

    const target = resolveLocalReference(reference, "styles.css");

    if (target) {
      assertFile(target, `referenced by CSS: ${reference}`);
    }
  }
});

test("contains no application API, runtime secret, or fabricated remote URL", () => {
  const content = [
    readShowcaseFile("index.html"),
    readShowcaseFile("styles.css"),
    readShowcaseFile("script.js"),
    readShowcaseFile("README.md"),
  ].join("\n");
  const trustedRepositoryUrl =
    "https://github.com/zhenwuchen/Mini-Mal";
  const contentWithoutTrustedRepository = content.replaceAll(
    trustedRepositoryUrl,
    "",
  );

  assert.doesNotMatch(content, /\/api\/internal\/orders\/expire/i);
  assert.doesNotMatch(content, /localhost:\d+/i);
  assert.doesNotMatch(
    content,
    /(?:AUTH_SECRET|CRON_SECRET)\s*[:=]\s*["'][^"']{8,}["']/i,
  );
  assert.doesNotMatch(content, /prisma\/dev\.db/i);
  assert.match(content, new RegExp(trustedRepositoryUrl.replace(/[.]/g, "\\.")));
  assert.doesNotMatch(
    contentWithoutTrustedRepository,
    /https?:\/\/[^\s)]*(?:vercel\.app|github\.com)/i,
  );
});

test("uses accessible images and includes explicit demo placeholders", () => {
  const html = readShowcaseFile("index.html");
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map(
    (match) => match[0],
  );

  assert.ok(images.length >= 3, "expected real screenshot images");

  for (const image of images) {
    assert.ok(getAttribute(image, "alt")?.trim(), `missing alt: ${image}`);
  }

  assert.ok(html.includes("演示视频待录制"));
  assert.match(html, /真实页面截图/);

  const requiredScreenshots = [
    "products.png",
    "products-mobile.png",
    "product-detail.png",
    "cart.png",
    "checkout.png",
    "order-detail.png",
    "profile.png",
    "admin-dashboard.png",
    "admin-products.png",
    "admin-orders.png",
  ];

  for (const fileName of requiredScreenshots) {
    const relativePath = `assets/screenshots/${fileName}`;
    const filePath = join(showcaseRoot, relativePath);
    assertFile(filePath, `required screenshot ${fileName}`);
    assert.ok(
      html.includes(`src="${relativePath}"`),
      `missing screenshot reference: ${relativePath}`,
    );
  }

  for (const image of images) {
    const source = getAttribute(image, "src");
    const alt = getAttribute(image, "alt");
    const declaredWidth = Number(getAttribute(image, "width"));
    const declaredHeight = Number(getAttribute(image, "height"));

    if (!source?.startsWith("assets/screenshots/")) continue;

    assert.match(alt ?? "", /Mini Mal1/);
    const actual = readPngDimensions(join(showcaseRoot, source));
    assert.equal(declaredWidth, actual.width, `wrong width: ${source}`);
    assert.equal(declaredHeight, actual.height, `wrong height: ${source}`);
  }
});

test("contains no prohibited infrastructure claims", () => {
  const html = readShowcaseFile("index.html");

  assert.doesNotMatch(html, /\bRedis\b/i);
  assert.doesNotMatch(html, /\bPostgreSQL\b/i);
  assert.doesNotMatch(html, /\bKafka\b/i);
  assert.doesNotMatch(html, /微服务架构/i);
});

test("all source files remain reasonably self-contained", () => {
  const files = readdirSync(showcaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => extname(entry.name) !== ".png");

  for (const file of files) {
    const size = statSync(join(showcaseRoot, file.name)).size;

    assert.ok(
      size < 200_000,
      `${relative(showcaseRoot, join(showcaseRoot, file.name))} is unexpectedly large`,
    );
  }
});

test("all local documentation links resolve", () => {
  const markdownFiles = [
    join(projectRoot, "README.md"),
    join(projectRoot, "screenshots", "README.md"),
    ...readdirSync(join(projectRoot, "docs", "showcase"))
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) => join(projectRoot, "docs", "showcase", fileName)),
  ];

  for (const markdownFile of markdownFiles) {
    const markdown = readFileSync(markdownFile, "utf8");

    for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const reference = match[1].split(/\s+/)[0];

      if (
        !reference ||
        reference.startsWith("#") ||
        isExternalReference(reference)
      ) {
        continue;
      }

      const target = resolve(
        dirname(markdownFile),
        decodeURIComponent(reference.split("#")[0]),
      );

      assert.ok(
        existsSync(target),
        `broken documentation link in ${relative(projectRoot, markdownFile)}: ${reference}`,
      );
    }
  }
});

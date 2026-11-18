import { runKeyIntegrationBrowserTest } from "../../../../tests/ui/key-integration.browser.mjs";

export async function GET() {
  if (
    process.env.MINI_MALL_UI_TEST !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(
    runKeyIntegrationBrowserTest.toString(),
    {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

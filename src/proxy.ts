import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { normalizeOrderNumber } from "@/lib/order-query-core";
import { prisma } from "@/lib/prisma";

export async function proxy(request: NextRequest) {
  const productMatch = request.nextUrl.pathname.match(
    /^\/products\/([^/]+)\/?$/,
  );

  if (productMatch) {
    return handleProductRequest(request, productMatch[1]);
  }

  const orderMatch = request.nextUrl.pathname.match(
    /^\/account\/orders\/([^/]+)\/?$/,
  );

  if (orderMatch) {
    return handleOrderRequest(request, orderMatch[1]);
  }

  return NextResponse.next();
}

async function handleProductRequest(
  request: NextRequest,
  encodedSlug: string,
) {
  let slug = "";

  try {
    slug = decodeURIComponent(encodedSlug);
  } catch {
    return renderNotFound(request, "/product-not-found");
  }

  const productExists = await prisma.product.count({
    where: {
      slug,
    },
  });

  if (productExists > 0) return NextResponse.next();

  return renderNotFound(request, "/product-not-found");
}

async function handleOrderRequest(
  request: NextRequest,
  encodedOrderNumber: string,
) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return NextResponse.next();

  let orderNumber = "";

  try {
    orderNumber = decodeURIComponent(encodedOrderNumber);
  } catch {
    return renderNotFound(request, "/account/order-not-found");
  }

  const normalizedOrderNumber = normalizeOrderNumber(orderNumber);

  if (!normalizedOrderNumber) {
    return renderNotFound(request, "/account/order-not-found");
  }

  try {
    const orderExists = await prisma.order.count({
      where: {
        orderNumber: normalizedOrderNumber,
        userId,
      },
    });

    if (orderExists > 0) return NextResponse.next();
  } catch {
    return NextResponse.next();
  }

  return renderNotFound(request, "/account/order-not-found");
}

async function renderNotFound(
  request: NextRequest,
  pathname: string,
) {
  const notFoundUrl = new URL(pathname, request.url);

  if (request.headers.get("RSC") === "1") {
    return NextResponse.rewrite(notFoundUrl, { status: 404 });
  }

  const notFoundResponse = await fetch(notFoundUrl, {
    headers: {
      accept: "text/html",
    },
    cache: "no-store",
  });

  return new NextResponse(notFoundResponse.body, {
    status: 404,
    headers: {
      "content-type":
        notFoundResponse.headers.get("content-type") ??
        "text/html; charset=utf-8",
      "x-robots-tag": "noindex",
    },
  });
}

export const config = {
  matcher: ["/products/:path*", "/account/orders/:path*"],
};

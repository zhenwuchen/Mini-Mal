import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  categories,
  type ProductCardData,
} from "../src/lib/catalog";
import {
  updateCatalogSearchParams,
} from "../src/lib/product-catalog";

mock.module("../src/components/QuickAddButton", {
  namedExports: {
    QuickAddButton: () =>
      createElement(
        "form",
        null,
        createElement(
          "button",
          { type: "button" },
          "加入购物袋",
        ),
      ),
  },
});


test("homepage categories use their real slugs in product-list URLs", async () => {
  assert.deepEqual(
    categories.map((category) => ({
      slug: category.slug,
      href: category.href,
    })),
    [
      {
        slug: "electronics",
        href: "/products?category=electronics",
      },
      {
        slug: "fashion",
        href: "/products?category=fashion",
      },
      {
        slug: "home-living",
        href: "/products?category=home-living",
      },
      {
        slug: "beauty",
        href: "/products?category=beauty",
      },
    ],
  );

  const { CategorySection } = await import(
    "../src/components/CategorySection"
  );
  const html = renderToStaticMarkup(
    createElement(CategorySection),
  );

  for (const href of [
    "/products?category=electronics",
    "/products?category=fashion",
    "/products?category=home-living",
    "/products?category=beauty",
  ]) {
    assert.ok(html.includes(`href="${href}"`));
  }
  assert.doesNotMatch(html, /href="#products"/);
});

test("changing category preserves search and sort but resets the page", () => {
  const current = new URLSearchParams(
    "search=lamp&category=electronics&sort=price-asc&page=2",
  );

  assert.equal(
    updateCatalogSearchParams(current, {
      category: "home-living",
    }).toString(),
    "search=lamp&category=home-living&sort=price-asc",
  );
});

test("category and search plus sort can be combined in catalog URLs", () => {
  const current = new URLSearchParams(
    "search=lamp&category=electronics&sort=price-desc",
  );
  const params = updateCatalogSearchParams(current, {
    category: "home-living",
  });

  assert.equal(
    params.toString(),
    "search=lamp&category=home-living&sort=price-desc",
  );
});

test("product cards link image and title to the current product slug", async () => {
  const { ProductCard } = await import(
    "../src/components/ProductCard"
  );
  const product: ProductCardData = {
    id: "product-reading-lamp",
    name: "阅读台灯",
    slug: "reading-lamp",
    price: 8_800,
    image: "/images/categories/home-living.jpg",
    category: "家居生活",
    stock: 8,
    isActive: true,
  };

  const html = renderToStaticMarkup(
    createElement(ProductCard, {
      product,
      loginHref: "/login?returnTo=%2Fproducts",
    }),
  );

  assert.match(html, /aria-label="查看 阅读台灯"/);
  assert.equal(
    html.match(/href="\/products\/reading-lamp"/g)?.length,
    2,
  );
  assert.doesNotMatch(html, /href="\/products\/product-reading-lamp"/);

  const imageLinkEnd = html.indexOf("</a>");
  const quickAddFormStart = html.indexOf("<form");
  const quickAddFormEnd = html.indexOf("</form>");
  const quickAddButton = html.indexOf("加入购物袋");

  assert.ok(imageLinkEnd >= 0);
  assert.ok(quickAddFormStart > imageLinkEnd);
  assert.ok(quickAddButton > quickAddFormStart);
  assert.ok(quickAddButton < quickAddFormEnd);
});

import type { Prisma } from "@prisma/client";

import type { ProductTag } from "@/lib/catalog";

export type ProductSort =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "newest";

export type ProductSearch = {
  q: string;
  category: string;
  sort: ProductSort;
};

export type CatalogCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type CatalogProduct = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  imageIsFallback: boolean;
  category: string;
  categorySlug: string;
  description: string | null;
  stock: number;
  isActive: boolean;
  tag?: ProductTag;
};

export type ProductGalleryImage = {
  src: string;
  alt: string;
  label: string;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export function normalizeProductSearchParams(
  params: RawSearchParams,
): ProductSearch {
  const sortValue = firstValue(params.sort);
  const sort: ProductSort =
    sortValue === "price-asc" ||
    sortValue === "price-desc" ||
    sortValue === "newest"
      ? sortValue
      : "featured";
  const search = firstValue(params.search);
  const legacySearch = firstValue(params.q);

  return {
    q: (search ?? legacySearch)?.trim() ?? "",
    category: firstValue(params.category)?.trim() ?? "",
    sort,
  };
}

export function updateCatalogSearchParams(
  current: URLSearchParams,
  changes: Partial<{
    search: string;
    category: string;
    sort: ProductSort;
  }>,
): URLSearchParams {
  const params = new URLSearchParams(current);

  if ("search" in changes) {
    params.delete("q");
    const search = changes.search?.trim() ?? "";

    if (search) {
      params.set("search", search);
    } else {
      params.delete("search");
    }
  }

  if ("category" in changes) {
    const category = changes.category?.trim() ?? "";

    if (category) {
      params.set("category", category);
    } else {
      params.delete("category");
    }
  }

  if ("sort" in changes) {
    if (!changes.sort || changes.sort === "featured") {
      params.delete("sort");
    } else {
      params.set("sort", changes.sort);
    }
  }

  return params;
}

export function buildProductWhere(
  search: ProductSearch,
): Prisma.ProductWhereInput {
  return {
    isActive: true,
    ...(search.q ? { name: { contains: search.q } } : {}),
    ...(search.category
      ? { category: { is: { slug: search.category } } }
      : {}),
  };
}

export function buildProductOrderBy(
  sort: ProductSort,
): Prisma.ProductOrderByWithRelationInput[] {
  if (sort === "price-asc") {
    return [{ price: "asc" }, { name: "asc" }];
  }
  if (sort === "price-desc") {
    return [{ price: "desc" }, { name: "asc" }];
  }
  if (sort === "newest") {
    return [{ createdAt: "desc" }, { name: "asc" }];
  }
  return [{ stock: "desc" }, { createdAt: "desc" }, { name: "asc" }];
}

export function deriveProductTag(stock: number): "LIMITED" | undefined {
  return stock <= 30 ? "LIMITED" : undefined;
}

import type {
  Category,
  PrismaClient,
  Product,
} from "@prisma/client";

import type {
  CatalogCategory,
  CatalogProduct,
  ProductSearch,
} from "@/lib/product-catalog";
import {
  buildProductOrderBy,
  buildProductWhere,
  CATALOG_PAGE_SIZE,
  deriveProductTag,
} from "@/lib/product-catalog";
import {
  isValidLocalImagePath,
  normalizeLocalImagePath,
} from "@/lib/image-path";

type ProductWithCategory = Product & {
  category: Category;
};

type ProductCatalogServiceDependencies = {
  prisma: PrismaClient;
};

const categoryImageBySlug: Record<string, string> = {
  electronics: "/images/categories/electronics.jpg",
  fashion: "/images/categories/fashion.jpg",
  "home-living": "/images/categories/home-living.jpg",
  beauty: "/images/categories/beauty.jpg",
};

export function resolveCatalogImage(
  imageUrl: string | null,
  categorySlug: string,
): string {
  return normalizeLocalImagePath(
    imageUrl,
    categoryImageBySlug[categorySlug] ??
      "/images/categories/home-living.jpg",
  );
}

export function toCatalogProduct(
  product: ProductWithCategory,
): CatalogProduct {
  const image = resolveCatalogImage(
    product.imageUrl,
    product.category.slug,
  );

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price,
    image,
    imageIsFallback: !isValidLocalImagePath(product.imageUrl),
    category: product.category.name,
    categorySlug: product.category.slug,
    description: product.description,
    stock: product.stock,
    isActive: product.isActive,
    tag: deriveProductTag(product.stock),
  };
}

export function createProductCatalogService({
  prisma,
}: ProductCatalogServiceDependencies) {
  async function getCatalogPageData(search: ProductSearch) {
    const where = buildProductWhere(search);
    const orderBy = buildProductOrderBy(search.sort);
    const [categoryRecords, totalCount, filteredCount] =
      await prisma.$transaction([
        prisma.category.findMany({
          orderBy: { name: "asc" },
        }),
        prisma.product.count({
          where: { isActive: true },
        }),
        prisma.product.count({ where }),
      ]);
    const totalPages =
      filteredCount === 0
        ? 0
        : Math.ceil(filteredCount / CATALOG_PAGE_SIZE);
    const requestedPage =
      Number.isSafeInteger(search.page) && search.page > 0
        ? search.page
        : 1;
    const page =
      totalPages === 0
        ? 1
        : Math.min(requestedPage, totalPages);
    const products =
      filteredCount === 0
        ? []
        : await prisma.product.findMany({
            where,
            orderBy,
            include: { category: true },
            skip: (page - 1) * CATALOG_PAGE_SIZE,
            take: CATALOG_PAGE_SIZE,
          });

    return {
      categories: categoryRecords.map<CatalogCategory>((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        description: category.description,
      })),
      totalCount,
      filteredCount,
      products: products.map(toCatalogProduct),
      page,
      pageSize: CATALOG_PAGE_SIZE,
      totalPages,
    };
  }

  return { getCatalogPageData };
}

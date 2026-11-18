import "server-only";

import { cache } from "react";

import {
  createProductCatalogService,
  resolveCatalogImage,
  toCatalogProduct,
} from "@/lib/product-catalog-service";
import {
  type ProductGalleryImage,
  type ProductSearch,
} from "@/lib/product-catalog";
import { prisma } from "@/lib/prisma";

const categoryImageBySlug: Record<string, string> = {
  electronics: "/images/categories/electronics.jpg",
  fashion: "/images/categories/fashion.jpg",
  "home-living": "/images/categories/home-living.jpg",
  beauty: "/images/categories/beauty.jpg",
};

const productCatalogService = createProductCatalogService({ prisma });

export async function getCatalogPageData(search: ProductSearch) {
  return productCatalogService.getCatalogPageData(search);
}

export async function getHomepageProductData() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
  });

  const catalogProducts = products.map(toCatalogProduct);

  return {
    totalCount: catalogProducts.length,
    products: catalogProducts,
  };
}

const getProductRecord = cache(async (slug: string) => {
  return prisma.product.findFirst({
    where: {
      slug,
    },
    include: {
      category: true,
    },
  });
});

export async function getProductDetail(slug: string) {
  const product = await getProductRecord(slug);

  if (!product) return null;

  const related = await prisma.product.findMany({
    where: {
      isActive: true,
      categoryId: product.categoryId,
      id: { not: product.id },
    },
    include: {
      category: true,
    },
    orderBy: [{ stock: "desc" }, { name: "asc" }],
    take: 4,
  });

  const catalogProduct = toCatalogProduct(product);
  const categoryImage = resolveCatalogImage(
    categoryImageBySlug[product.category.slug] ?? null,
    product.category.slug,
  );

  const galleryCandidates: ProductGalleryImage[] = [
    {
      src: catalogProduct.image,
      alt: product.name,
      label: "商品主图",
    },
    {
      src: categoryImage,
      alt: `${product.category.name}生活方式场景`,
      label: "生活场景",
    },
    {
      src: "/images/brand-story.jpg",
      alt: "Mini Mal1 自然材质与器物细节",
      label: "材质细节",
    },
  ];
  const galleryImages = galleryCandidates.filter(
    (image, index, images) =>
      images.findIndex((candidate) => candidate.src === image.src) === index,
  );

  return {
    product: catalogProduct,
    galleryImages,
    relatedProducts: related.map(toCatalogProduct),
  };
}

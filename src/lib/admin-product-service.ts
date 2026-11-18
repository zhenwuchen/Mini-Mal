import { randomUUID } from "node:crypto";

import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import type {
  AdminProductInput,
  AdminProductSearch,
} from "@/lib/admin-product";

export type AdminProductErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "PRODUCT_CONFLICT"
  | "PRODUCT_OPERATION_FAILED";

const adminProductErrorMessages: Record<
  AdminProductErrorCode,
  string
> = {
  PRODUCT_NOT_FOUND: "商品不存在或已被移除",
  CATEGORY_NOT_FOUND: "所选分类不存在，请刷新页面后重试",
  PRODUCT_CONFLICT: "商品标识冲突，请稍后重试",
  PRODUCT_OPERATION_FAILED: "商品操作失败，请稍后重试",
};

export class AdminProductError extends Error {
  readonly code: AdminProductErrorCode;

  constructor(code: AdminProductErrorCode) {
    super(adminProductErrorMessages[code]);
    this.name = "AdminProductError";
    this.code = code;
  }
}

export type AdminProductSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category: {
    id: string;
    name: string;
    slug: string;
  };
};

export type AdminProductListResult = {
  products: AdminProductSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminProductCategoryOption = {
  id: string;
  name: string;
  slug: string;
};

export type AdminProductService = {
  list(search: AdminProductSearch): Promise<AdminProductListResult>;
  getById(id: string): Promise<AdminProductSummary | null>;
  getCategoryOptions(): Promise<AdminProductCategoryOption[]>;
  create(input: AdminProductInput): Promise<AdminProductSummary>;
  update(id: string, input: AdminProductInput): Promise<AdminProductSummary>;
  setActive(id: string, isActive: boolean): Promise<AdminProductSummary>;
  archive(id: string): Promise<{
    id: string;
    name: string;
    mode: "ARCHIVED";
    hadOrderHistory: boolean;
  }>;
};

type AdminProductServiceDependencies = {
  prisma: PrismaClient;
};

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

const productSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  price: true,
  stock: true,
  imageUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
} satisfies Prisma.ProductSelect;

function normalizePage(page: number) {
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function slugifyProductName(name: string) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  const token = randomUUID().replace(/-/g, "").slice(0, 10);

  return base ? `${base}-${token}` : `product-${token}`;
}

export function createAdminProductService({
  prisma,
}: AdminProductServiceDependencies): AdminProductService {
  async function assertCategoryExists(categoryId: string) {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new AdminProductError("CATEGORY_NOT_FOUND");
    }
  }

  async function list(
    search: AdminProductSearch,
  ): Promise<AdminProductListResult> {
    const page = normalizePage(search.page);
    const pageSize = DEFAULT_PAGE_SIZE;
    const where: Prisma.ProductWhereInput = {
      ...(search.q ? { name: { contains: search.q } } : {}),
      ...(search.categoryId
        ? { categoryId: search.categoryId }
        : {}),
      ...(search.status === "active"
        ? { isActive: true }
        : search.status === "inactive"
          ? { isActive: false }
          : {}),
    };

    try {
      const [totalCount, initialProducts] = await prisma.$transaction([
        prisma.product.count({ where }),
        prisma.product.findMany({
          where,
          select: productSelect,
          orderBy: [
            { createdAt: "desc" },
            { id: "asc" },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      const totalPages =
        totalCount === 0
          ? 0
          : Math.ceil(totalCount / Math.min(pageSize, MAX_PAGE_SIZE));
      const effectivePage =
        totalPages > 0 ? Math.min(page, totalPages) : 1;
      const products =
        initialProducts.length > 0 || effectivePage === page
          ? initialProducts
          : await prisma.product.findMany({
              where,
              select: productSelect,
              orderBy: [
                { createdAt: "desc" },
                { id: "asc" },
              ],
              skip: (effectivePage - 1) * pageSize,
              take: pageSize,
            });

      return {
        products,
        totalCount,
        page: effectivePage,
        pageSize,
        totalPages,
      };
    } catch {
      throw new AdminProductError("PRODUCT_OPERATION_FAILED");
    }
  }

  async function getById(
    id: string,
  ): Promise<AdminProductSummary | null> {
    return prisma.product.findUnique({
      where: { id },
      select: productSelect,
    });
  }

  async function getCategoryOptions() {
    return prisma.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  async function create(
    input: AdminProductInput,
  ): Promise<AdminProductSummary> {
    await assertCategoryExists(input.categoryId);

    try {
      return await prisma.product.create({
        data: {
          name: input.name,
          slug: slugifyProductName(input.name),
          description: input.description,
          price: input.price,
          imageUrl: input.imageUrl,
          stock: input.stock,
          categoryId: input.categoryId,
          isActive: input.isActive,
        },
        select: productSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new AdminProductError("PRODUCT_CONFLICT");
      }

      if (error instanceof AdminProductError) {
        throw error;
      }

      throw new AdminProductError("PRODUCT_OPERATION_FAILED");
    }
  }

  async function update(
    id: string,
    input: AdminProductInput,
  ): Promise<AdminProductSummary> {
    await assertCategoryExists(input.categoryId);

    const existing = await prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new AdminProductError("PRODUCT_NOT_FOUND");
    }

    try {
      return await prisma.product.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description,
          price: input.price,
          imageUrl: input.imageUrl,
          stock: input.stock,
          categoryId: input.categoryId,
          isActive: input.isActive,
        },
        select: productSelect,
      });
    } catch (error) {
      if (error instanceof AdminProductError) {
        throw error;
      }

      throw new AdminProductError("PRODUCT_OPERATION_FAILED");
    }
  }

  async function setActive(
    id: string,
    isActive: boolean,
  ): Promise<AdminProductSummary> {
    try {
      return await prisma.product.update({
        where: { id },
        data: { isActive },
        select: productSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new AdminProductError("PRODUCT_NOT_FOUND");
      }

      throw new AdminProductError("PRODUCT_OPERATION_FAILED");
    }
  }

  async function archive(id: string) {
    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: {
          select: { orderItems: true },
        },
      },
    });

    if (!product) {
      throw new AdminProductError("PRODUCT_NOT_FOUND");
    }

    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      id,
      name: product.name,
      mode: "ARCHIVED" as const,
      hadOrderHistory: product._count.orderItems > 0,
    };
  }

  return {
    list,
    getById,
    getCategoryOptions,
    create,
    update,
    setActive,
    archive,
  };
}

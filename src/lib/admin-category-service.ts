import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import type { AdminCategoryInput } from "@/lib/admin-category";

export type AdminCategoryErrorCode =
  | "CATEGORY_NOT_FOUND"
  | "CATEGORY_SLUG_EXISTS"
  | "CATEGORY_HAS_PRODUCTS"
  | "CATEGORY_OPERATION_FAILED";

const adminCategoryErrorMessages: Record<
  AdminCategoryErrorCode,
  string
> = {
  CATEGORY_NOT_FOUND: "分类不存在或已被删除",
  CATEGORY_SLUG_EXISTS: "分类标识已存在，请换一个标识",
  CATEGORY_HAS_PRODUCTS: "该分类仍有关联商品，不能删除",
  CATEGORY_OPERATION_FAILED: "分类操作失败，请稍后重试",
};

export class AdminCategoryError extends Error {
  readonly code: AdminCategoryErrorCode;

  constructor(code: AdminCategoryErrorCode) {
    super(adminCategoryErrorMessages[code]);
    this.name = "AdminCategoryError";
    this.code = code;
  }
}

export type AdminCategorySummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminCategoryService = {
  list(): Promise<AdminCategorySummary[]>;
  create(input: AdminCategoryInput): Promise<AdminCategorySummary>;
  update(
    id: string,
    input: AdminCategoryInput,
  ): Promise<AdminCategorySummary>;
  delete(id: string): Promise<void>;
};

type AdminCategoryServiceDependencies = {
  prisma: PrismaClient;
};

function toSummary(category: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { products: number };
}): AdminCategorySummary {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description,
    productCount: category._count.products,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function mapCategoryWriteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new AdminCategoryError("CATEGORY_SLUG_EXISTS");
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  ) {
    throw new AdminCategoryError("CATEGORY_NOT_FOUND");
  }

  if (error instanceof AdminCategoryError) {
    throw error;
  }

  throw new AdminCategoryError("CATEGORY_OPERATION_FAILED");
}

export function createAdminCategoryService({
  prisma,
}: AdminCategoryServiceDependencies): AdminCategoryService {
  async function list(): Promise<AdminCategorySummary[]> {
    const categories = await prisma.category.findMany({
      include: {
        _count: {
          select: { products: true },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return categories.map(toSummary);
  }

  async function create(
    input: AdminCategoryInput,
  ): Promise<AdminCategorySummary> {
    try {
      const category = await prisma.category.create({
        data: input,
        include: {
          _count: {
            select: { products: true },
          },
        },
      });

      return toSummary(category);
    } catch (error) {
      mapCategoryWriteError(error);
    }
  }

  async function update(
    id: string,
    input: AdminCategoryInput,
  ): Promise<AdminCategorySummary> {
    try {
      const category = await prisma.category.update({
        where: { id },
        data: input,
        include: {
          _count: {
            select: { products: true },
          },
        },
      });

      return toSummary(category);
    } catch (error) {
      mapCategoryWriteError(error);
    }
  }

  async function deleteCategory(id: string): Promise<void> {
    try {
      await prisma.$transaction(async (transaction) => {
        const category = await transaction.category.findUnique({
          where: { id },
          select: {
            _count: {
              select: { products: true },
            },
          },
        });

        if (!category) {
          throw new AdminCategoryError("CATEGORY_NOT_FOUND");
        }

        if (category._count.products > 0) {
          throw new AdminCategoryError("CATEGORY_HAS_PRODUCTS");
        }

        await transaction.category.delete({
          where: { id },
        });
      });
    } catch (error) {
      mapCategoryWriteError(error);
    }
  }

  return {
    list,
    create,
    update,
    delete: deleteCategory,
  };
}

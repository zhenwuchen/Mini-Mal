import Link from "next/link";

import { CategoryDeleteForm } from "@/components/admin/AdminActionForms";
import { CategoryForm } from "@/components/admin/CategoryForm";
import {
  AdminEmptyState,
  AdminFlashMessage,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { createAdminCategoryService } from "@/lib/admin-category-service";
import { requireAdmin } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const instant = false;

const categoryService = createAdminCategoryService({ prisma });

const flashMessages: Record<string, string> = {
  created: "分类已创建。",
  updated: "分类信息已更新。",
  deleted: "空分类已删除。",
};

export default async function AdminCategoriesPage({
  searchParams,
}: PageProps<"/admin/categories">) {
  await requireAdmin("/admin/categories");
  const query = await searchParams;
  const messageValue =
    typeof query.message === "string" ? query.message : "";
  const flashMessage = flashMessages[messageValue];

  const categories = await categoryService.list();

  return (
    <div>
        <AdminPageHeader
          eyebrow="Category management"
          title="分类管理"
          description="分类标识在数据库内唯一。只要分类仍关联商品，删除操作就会被服务端拒绝。"
        />

        {flashMessage && (
          <div className="mt-6">
            <AdminFlashMessage>{flashMessage}</AdminFlashMessage>
          </div>
        )}

        <div className="mt-8 grid items-start gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="border border-rule bg-paper p-5 sm:p-6 xl:sticky xl:top-8">
            <p className="text-[9px] font-medium tracking-[0.16em] text-earth uppercase">
              New category
            </p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.045em]">
              新增分类
            </h2>
            <p className="mt-3 text-xs leading-6 text-muted">
              标识用于商城筛选链接，建议使用清晰的英文小写短词。
            </p>
            <div className="mt-6">
              <CategoryForm compact />
            </div>
          </aside>

          <section className="min-w-0">
            <div className="flex items-end justify-between gap-5 border-b border-rule pb-3">
              <h2 className="font-serif text-3xl tracking-[-0.045em]">
                全部分类
              </h2>
              <p role="status" className="text-xs text-muted">
                共 {categories.length} 个
              </p>
            </div>

            {categories.length > 0 ? (
              <div className="mt-4 border border-rule bg-paper">
                {categories.map((category) => (
                  <article
                    key={category.id}
                    className="border-b border-rule/75 p-5 last:border-b-0 sm:p-6"
                  >
                    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_110px_auto] sm:items-start">
                      <div className="min-w-0">
                        <h3 className="text-base font-medium text-ink">
                          {category.name}
                        </h3>
                        <p className="mt-1 break-all text-[10px] tracking-[0.05em] text-earth">
                          /{category.slug}
                        </p>
                        {category.description && (
                          <p className="mt-3 max-w-[560px] text-xs leading-6 text-muted">
                            {category.description}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[9px] tracking-[0.1em] text-muted">
                          关联商品
                        </p>
                        <p className="mt-1 text-lg tabular-nums text-ink">
                          {category.productCount}
                        </p>
                        <p className="mt-3 text-[9px] leading-4 text-muted">
                          创建于 {formatDate(category.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-start gap-4 sm:flex-col sm:items-end">
                        <Link
                          href={`/admin/products?category=${encodeURIComponent(category.id)}`}
                          className="inline-flex min-h-9 items-center text-[10px] font-medium text-ink transition-colors hover:text-earth"
                        >
                          查看商品
                        </Link>
                        <details className="w-full sm:w-auto">
                          <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-[10px] font-medium text-ink transition-colors hover:text-earth">
                            编辑分类
                          </summary>
                          <div className="mt-4 border-t border-rule pt-4 sm:w-[300px]">
                            <CategoryForm category={category} compact />
                          </div>
                        </details>
                        <CategoryDeleteForm
                          categoryId={category.id}
                          categoryName={category.name}
                          productCount={category.productCount}
                        />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <AdminEmptyState
                title="还没有分类"
                description="先创建分类，才能新增并管理关联商品。"
              />
            )}
          </section>
        </div>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

import Link from "next/link";

import {
  AdminFlashMessage,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import {
  ProductArchiveForm,
  ProductStatusForm,
} from "@/components/admin/AdminActionForms";
import { CatalogImage } from "@/components/CatalogImage";
import { createAdminProductService } from "@/lib/admin-product-service";
import { normalizeAdminProductSearchParams } from "@/lib/admin-product";
import { requireAdmin } from "@/lib/auth-session";
import { formatPrice } from "@/lib/catalog";
import { normalizeLocalImagePath } from "@/lib/image-path";
import { prisma } from "@/lib/prisma";

const productService = createAdminProductService({ prisma });

const flashMessages: Record<string, string> = {
  created: "商品已创建并保存到数据库。",
  updated: "商品信息已更新。",
  activated: "商品已上架，商城会显示最新状态。",
  deactivated: "商品已下架，历史订单快照保持不变。",
  archived: "商品已归档为下架状态，历史订单中的商品快照已保留。",
};

export default async function AdminProductsPage({
  searchParams,
}: PageProps<"/admin/products">) {
  await requireAdmin("/admin/products");
  const rawSearchParams = await searchParams;
  const search = normalizeAdminProductSearchParams(rawSearchParams);
  const messageValue =
    typeof rawSearchParams.message === "string"
      ? rawSearchParams.message
      : "";
  const flashMessage = flashMessages[messageValue];

  const [result, categories] = await Promise.all([
    productService.list(search),
    productService.getCategoryOptions(),
  ]);

  return (
    <div>
        <AdminPageHeader
          eyebrow="Product management"
          title="商品管理"
          description="管理真实商品价格、库存、分类和上下架状态。删除商品采用归档方式，历史订单仍保留下单时的快照。"
          actions={
            <Link
              href="/admin/products/new"
              className="inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white transition-colors hover:border-earth hover:bg-earth"
            >
              新增商品
            </Link>
          }
        />

        {flashMessage && (
          <div className="mt-6">
            <AdminFlashMessage>{flashMessage}</AdminFlashMessage>
          </div>
        )}

        <form
          action="/admin/products"
          method="get"
          className="mt-7 grid gap-3 border border-rule bg-paper p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_220px_170px_auto] lg:items-end"
        >
          <FilterField id="product-search" label="搜索商品名称">
            <input
              id="product-search"
              name="q"
              type="search"
              defaultValue={search.q}
              placeholder="输入商品名称"
              className={filterInputClass}
            />
          </FilterField>
          <FilterField id="product-category-filter" label="分类">
            <select
              id="product-category-filter"
              name="category"
              defaultValue={search.categoryId ?? "all"}
              className={filterInputClass}
            >
              <option value="all">全部分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField id="product-status-filter" label="销售状态">
            <select
              id="product-status-filter"
              name="status"
              defaultValue={search.status}
              className={filterInputClass}
            >
              <option value="all">全部状态</option>
              <option value="active">已上架</option>
              <option value="inactive">已下架</option>
            </select>
          </FilterField>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white transition-colors hover:bg-earth"
            >
              筛选
            </button>
            <Link
              href="/admin/products"
              className="inline-flex min-h-11 items-center px-3 text-[11px] text-muted transition-colors hover:text-ink"
            >
              清除
            </Link>
          </div>
        </form>

        <div className="mt-6 flex flex-col gap-2 border-b border-rule pb-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-xs text-muted">
            共 {result.totalCount} 件商品
          </p>
          {result.totalPages > 0 && (
            <p className="text-[10px] text-muted">
              第 {result.page} / {result.totalPages} 页
            </p>
          )}
        </div>

        {result.products.length > 0 ? (
          <div className="mt-4 overflow-x-auto border border-rule bg-paper">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule bg-[#ece6dd]/75 text-[9px] tracking-[0.1em] text-muted">
                  <th className="px-4 py-3 font-medium">商品</th>
                  <th className="px-4 py-3 font-medium">价格</th>
                  <th className="px-4 py-3 font-medium">库存</th>
                  <th className="px-4 py-3 font-medium">分类</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {result.products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-rule/75 last:border-b-0"
                  >
                    <td className="px-4 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="relative aspect-[4/5] w-12 shrink-0 overflow-hidden bg-[#e7dfd5]">
                          <CatalogImage
                            src={productImage(
                              product.imageUrl,
                              product.category.slug,
                            )}
                            alt={product.name}
                            sizes="48px"
                            className="object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="max-w-[260px] truncate text-sm font-medium text-ink">
                            {product.name}
                          </p>
                          <p className="mt-1 max-w-[260px] truncate text-[10px] text-muted">
                            {product.slug}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm tabular-nums text-ink">
                      {formatPrice(product.price)}
                    </td>
                    <td className="px-4 py-4 text-sm tabular-nums text-ink">
                      {product.stock}
                    </td>
                    <td className="px-4 py-4 text-xs text-ink">
                      {product.category.name}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex min-h-7 items-center border px-2.5 text-[9px] font-medium tracking-[0.08em] ${
                          product.isActive
                            ? "border-[#55735a]/30 bg-[#55735a]/7 text-[#49644e]"
                            : "border-muted/25 bg-muted/5 text-muted"
                        }`}
                      >
                        {product.isActive ? "已上架" : "已下架"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[10px] text-muted">
                      {formatAdminDate(product.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-start justify-end gap-1">
                        <Link
                          href={`/admin/products/${encodeURIComponent(product.id)}/edit`}
                          className="inline-flex min-h-9 items-center px-2 text-[10px] font-medium text-ink transition-colors hover:text-earth"
                        >
                          编辑
                        </Link>
                        <ProductStatusForm
                          productId={product.id}
                          isActive={product.isActive}
                        />
                        <ProductArchiveForm productId={product.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border-y border-rule py-16 text-center sm:py-20">
            <h2 className="font-serif text-3xl tracking-[-0.04em]">
              没有找到商品
            </h2>
            <p className="mx-auto mt-4 max-w-[420px] text-sm leading-7 text-muted">
              调整筛选条件，或创建商城的第一件商品。
            </p>
            <Link
              href="/admin/products/new"
              className="mt-7 inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white"
            >
              新增商品
            </Link>
          </div>
        )}

        {result.totalPages > 1 && (
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            q={search.q}
            categoryId={search.categoryId}
            status={search.status}
          />
        )}
    </div>
  );
}

const filterInputClass =
  "min-h-11 w-full border border-rule bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-earth";

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[9px] font-medium tracking-[0.08em] text-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  q,
  categoryId,
  status,
}: {
  page: number;
  totalPages: number;
  q: string;
  categoryId: string | undefined;
  status: string;
}) {
  return (
    <nav
      aria-label="商品分页"
      className="flex items-center justify-between gap-4 py-6"
    >
      {page > 1 ? (
        <Link
          href={productListHref(page - 1, q, categoryId, status)}
          className={paginationLinkClass}
        >
          上一页
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="text-[10px] tabular-nums text-muted">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={productListHref(page + 1, q, categoryId, status)}
          className={paginationLinkClass}
        >
          下一页
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}

const paginationLinkClass =
  "inline-flex min-h-10 items-center border border-rule bg-paper px-4 text-[10px] font-medium text-ink transition-colors hover:border-ink";

function productListHref(
  page: number,
  q: string,
  categoryId: string | undefined,
  status: string,
) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (categoryId) params.set("category", categoryId);
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/products?${query}` : "/admin/products";
}

function productImage(
  imageUrl: string | null,
  categorySlug: string,
) {
  const fallbacks: Record<string, string> = {
    electronics: "/images/categories/electronics.jpg",
    fashion: "/images/categories/fashion.jpg",
    "home-living": "/images/categories/home-living.jpg",
    beauty: "/images/categories/beauty.jpg",
  };
  return normalizeLocalImagePath(
    imageUrl,
    fallbacks[categorySlug] ??
      "/images/categories/home-living.jpg",
  );
}

function formatAdminDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

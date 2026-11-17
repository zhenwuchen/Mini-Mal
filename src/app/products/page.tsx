import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CatalogFilters } from "@/components/CatalogFilters";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ProductCard } from "@/components/ProductCard";
import { SkipLink } from "@/components/SkipLink";
import { normalizeProductSearchParams } from "@/lib/product-catalog";
import { getCatalogPageData } from "@/lib/products";

export const metadata: Metadata = {
  title: "全部精选商品 | Mini Mal1",
  description: "探索 Mini Mal1 精选的数码、服饰、家居与美妆个护产品。",
};

export default function ProductsPage({
  searchParams,
}: PageProps<"/products">) {
  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content">
        <section className="border-b border-rule/70">
          <div className="mx-auto w-full max-w-[1440px] px-5 pt-12 pb-14 sm:px-8 sm:pt-16 sm:pb-16 lg:px-12 lg:pt-20 lg:pb-20 xl:px-16">
            <nav
              aria-label="面包屑"
              className="mb-10 flex items-center gap-3 text-[10px] tracking-[0.12em] text-muted uppercase"
            >
              <Link href="/" className="transition-colors hover:text-ink">
                首页
              </Link>
              <span aria-hidden="true">/</span>
              <span className="text-ink">全部商品</span>
            </nav>
            <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-end">
              <div>
                <p className="mb-4 text-[10px] font-medium tracking-[0.22em] text-earth uppercase">
                  The collection
                </p>
                <h1 className="max-w-[760px] font-serif text-[2.8rem] leading-[1.02] tracking-[-0.05em] text-balance sm:text-6xl lg:text-7xl">
                  全部精选商品
                </h1>
              </div>
              <p className="max-w-[340px] text-[13px] leading-6 text-muted sm:text-sm sm:leading-7 lg:justify-self-end">
                从设计、材质到使用感受，我们只留下真正值得进入生活的选择。
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-12 lg:px-12 lg:py-14 xl:px-16">
          <Suspense fallback={<CatalogPageSkeleton />}>
            <CatalogContent searchParams={searchParams} />
          </Suspense>
        </section>
      </main>
      <Footer />
    </>
  );
}

async function CatalogContent({
  searchParams,
}: Pick<PageProps<"/products">, "searchParams">) {
  const search = normalizeProductSearchParams(await searchParams);
  const data = await getCatalogPageData(search);
  const hasFilters = Boolean(search.q || search.category);

  return (
    <>
      <CatalogFilters
        key={`${search.q}|${search.category}|${search.sort}`}
        categories={data.categories}
        search={search.q}
        category={search.category}
        sort={search.sort}
      />

      <div className="mt-8 flex flex-col gap-3 border-b border-rule/70 pb-4 sm:mt-10 sm:flex-row sm:items-end sm:justify-between">
        <p role="status" className="text-sm text-ink">
          共 {data.filteredCount} 件商品
        </p>
        <p className="text-[10px] tracking-[0.12em] text-muted">
          {hasFilters ? "筛选结果" : "已上架商品"}
        </p>
      </div>

      {data.products.length > 0 ? (
        <div
          id="catalog-results"
          className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 sm:mt-10 sm:gap-x-4 sm:gap-y-14 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-5"
        >
          {data.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div
          id="catalog-results"
          className="mt-12 border-y border-rule/80 py-20 text-center sm:py-28"
        >
          <p className="font-serif text-3xl tracking-[-0.04em] sm:text-4xl">
            {hasFilters ? "没有找到匹配商品" : "暂时没有上架商品"}
          </p>
          <p className="mx-auto mt-4 max-w-[380px] text-sm leading-7 text-muted">
            {hasFilters
              ? "试试更换关键词、分类或排序条件。"
              : "我们正在整理下一批精选商品，请稍后再来看看。"}
          </p>
          <Link
            href={hasFilters ? "/products" : "/"}
            className="mt-7 inline-flex min-h-11 items-center border border-ink px-5 py-3 text-[10px] font-medium tracking-[0.14em] uppercase transition-colors hover:bg-ink hover:text-white"
          >
            {hasFilters ? "清除筛选" : "返回首页"}
          </Link>
        </div>
      )}
    </>
  );
}

function CatalogPageSkeleton() {
  return (
    <div aria-busy="true" aria-label="正在加载商品">
      <div className="border-y border-rule/80 py-6">
        <div className="h-10 w-full bg-rule/35" />
        <div className="mt-6 flex gap-8">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-4 w-16 bg-rule/35" />
          ))}
        </div>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-5">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index}>
            <div className="aspect-[4/5] bg-rule/30" />
            <div className="mt-4 h-3 w-20 bg-rule/35" />
            <div className="mt-3 h-4 w-3/4 bg-rule/30" />
          </div>
        ))}
      </div>
    </div>
  );
}


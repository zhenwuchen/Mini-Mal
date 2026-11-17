import Link from "next/link";
import { Suspense } from "react";

import { ArrowRightIcon } from "@/components/Icons";
import { ProductCard } from "@/components/ProductCard";
import { getHomepageProductData } from "@/lib/products";

export function ProductSection() {
  return (
    <section
      id="products"
      aria-labelledby="products-heading"
      className="border-y border-rule/80 bg-paper"
    >
      <div className="mx-auto w-full max-w-[1440px] px-5 py-[4.5rem] sm:px-8 sm:py-20 lg:px-12 lg:py-24 xl:px-16 xl:py-28">
        <div className="mb-9 flex items-end justify-between gap-6 sm:mb-12 lg:mb-14">
          <div>
            <p className="mb-4 text-[10px] font-medium tracking-[0.24em] text-earth uppercase">
              Most wanted
            </p>
            <h2
              id="products-heading"
              className="font-serif text-[2.15rem] tracking-[-0.045em] sm:text-[2.9rem] lg:text-[3.4rem]"
            >
              热门精选
            </h2>
          </div>
          <Link
            href="/products"
            className="hidden items-center gap-3 border-b border-ink pb-1 text-[11px] font-medium tracking-[0.12em] text-ink transition-colors hover:border-earth hover:text-earth sm:inline-flex"
          >
            浏览全部商品
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>

        <Suspense fallback={<HomepageProductGridFallback />}>
          <HomepageProductGrid />
        </Suspense>

        <Link
          href="/products"
          className="mt-10 inline-flex items-center gap-3 border-b border-ink pb-1 text-[11px] font-medium tracking-[0.12em] text-ink transition-colors hover:border-earth hover:text-earth sm:hidden"
        >
          浏览全部商品
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
    </section>
  );
}

async function HomepageProductGrid() {
  const { products, totalCount } = await getHomepageProductData();

  return (
    <>
      <p role="status" className="sr-only">
        数据库共有 {totalCount} 件有效商品，首页展示 {products.length} 件精选商品。
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-4 sm:gap-y-14 lg:grid-cols-4 lg:gap-x-5">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </>
  );
}

function HomepageProductGridFallback() {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载热门商品"
      className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-4 sm:gap-y-14 lg:grid-cols-4 lg:gap-x-5"
    >
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index}>
          <div className="aspect-[4/5] bg-rule/30" />
          <div className="mt-4 h-3 w-20 bg-rule/35" />
          <div className="mt-3 h-4 w-3/4 bg-rule/30" />
        </div>
      ))}
    </div>
  );
}

import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";

export function OrderNotFoundState() {
  return (
    <>
      <SkipLink />
      <Header />
      <main
        id="main-content"
        className="mx-auto flex min-h-[62vh] w-full max-w-[1440px] items-center px-5 py-20 sm:px-8 lg:px-12 xl:px-16"
      >
        <div className="max-w-[660px] border-y border-rule/80 py-14 sm:py-20">
          <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
            Order not found
          </p>
          <h1 className="mt-5 font-serif text-4xl leading-[1.05] tracking-[-0.045em] text-balance sm:text-6xl">
            这笔订单不存在。
          </h1>
          <p className="mt-6 max-w-[480px] text-sm leading-7 text-muted">
            当前链接可能已失效，或这笔订单不属于你的账户。你可以返回订单列表继续查看。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/account/orders"
              className="inline-flex min-h-12 items-center bg-ink px-6 py-3.5 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
            >
              返回订单列表
            </Link>
            <Link
              href="/products"
              className="border-b border-ink pb-1 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth"
            >
              返回商品列表
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

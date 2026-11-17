import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";

export default function ProductNotFound() {
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
            Product not found
          </p>
          <h1 className="mt-5 font-serif text-4xl leading-[1.05] tracking-[-0.045em] text-balance sm:text-6xl">
            这件商品暂时离开了货架。
          </h1>
          <p className="mt-6 max-w-[480px] text-sm leading-7 text-muted">
            当前链接可能已失效或商品尚未上架。返回全部商品，继续寻找适合你的日常物件。
          </p>
          <Link
            href="/products"
            className="mt-8 inline-flex min-h-12 items-center bg-ink px-6 py-3.5 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
          >
            返回商品列表
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}

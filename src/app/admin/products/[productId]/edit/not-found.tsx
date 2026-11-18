import Link from "next/link";

export default function AdminProductNotFound() {
  return (
    <section className="border-y border-rule py-16 sm:py-20">
      <p className="text-[9px] font-medium tracking-[0.18em] text-earth uppercase">
        Product unavailable
      </p>
      <h1 className="mt-4 font-serif text-4xl tracking-[-0.045em]">
        商品不存在
      </h1>
      <p className="mt-5 max-w-[480px] text-sm leading-7 text-muted">
        这个商品可能已被移除，或链接中的商品编号无效。
      </p>
      <Link
        href="/admin/products"
        className="mt-7 inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white"
      >
        返回商品列表
      </Link>
    </section>
  );
}

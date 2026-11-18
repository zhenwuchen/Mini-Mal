import Link from "next/link";

export default function AdminOrderNotFound() {
  return (
    <section className="border-y border-rule py-16 sm:py-20">
      <p className="text-[9px] font-medium tracking-[0.18em] text-earth uppercase">
        Order unavailable
      </p>
      <h1 className="mt-4 font-serif text-4xl tracking-[-0.045em]">
        订单不存在
      </h1>
      <p className="mt-5 max-w-[480px] text-sm leading-7 text-muted">
        这个订单可能已被移除，或链接中的订单编号无效。
      </p>
      <Link
        href="/admin/orders"
        className="mt-7 inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white"
      >
        返回订单列表
      </Link>
    </section>
  );
}

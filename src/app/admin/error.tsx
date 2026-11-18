"use client";

export default function AdminError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="border-y border-rule py-16 sm:py-20">
      <p className="text-[9px] font-medium tracking-[0.18em] text-earth uppercase">
        Admin error
      </p>
      <h1 className="mt-4 font-serif text-4xl tracking-[-0.045em]">
        后台页面暂时无法加载
      </h1>
      <p className="mt-5 max-w-[520px] text-sm leading-7 text-muted">
        服务端没有完成这次请求。你可以重试当前页面；已保存的商品、分类和订单数据不会受到影响。
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-7 inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white transition-colors hover:bg-earth"
      >
        重新加载
      </button>
    </section>
  );
}

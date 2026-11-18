import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PaymentHistory } from "@/components/orders/PaymentHistory";
import { SkipLink } from "@/components/SkipLink";
import { requireUser } from "@/lib/auth-session";
import { formatPrice } from "@/lib/catalog";
import { isOrderExpired } from "@/lib/order-policy";
import {
  getOrderDetail,
  OrderQueryError,
  type OrderDetail,
} from "@/lib/order-query";

export const instant = false;

export const metadata: Metadata = {
  title: "支付结果 | Mini Mal1",
  robots: { index: false, follow: false },
};

export default async function PaymentResultPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  await requireUser(
    `/account/orders/${encodeURIComponent(orderNumber)}/payment-result`,
  );

  let order: OrderDetail;

  try {
    order = await getOrderDetail(orderNumber);
  } catch (error) {
    if (
      error instanceof OrderQueryError &&
      error.code === "ORDER_NOT_FOUND"
    ) {
      notFound();
    }

    throw error;
  }

  const latestPayment = order.payments[0];
  const succeeded =
    order.status === "PAID" ||
    latestPayment?.status === "SUCCEEDED";
  const failed = latestPayment?.status === "FAILED";
  const expired = isOrderExpired(order.expiresAt, new Date());
  const canRetry =
    order.status === "PENDING_PAYMENT" && !expired && failed;

  return (
    <>
      <SkipLink />
      <Header />
      <main
        id="main-content"
        className="mx-auto flex min-h-[66vh] w-full max-w-[1040px] items-center px-5 py-14 sm:px-8 lg:px-12"
      >
        <div className="w-full">
          <div className="grid gap-10 border-y border-rule/80 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
                Payment result
              </p>
              <h1 className="mt-5 font-serif text-5xl leading-[1.02] tracking-[-0.05em] sm:text-7xl">
                {succeeded
                  ? "支付完成"
                  : failed
                    ? "本次支付未完成"
                    : "正在确认支付状态"}
              </h1>
              <p className="mt-6 max-w-[560px] text-sm leading-7 text-muted">
                {succeeded
                  ? "服务端已确认订单进入已付款状态。成功订单不能再次发起支付。"
                  : failed
                    ? latestPayment.failureReason ??
                      "模拟支付失败，可以重新发起新的支付尝试。"
                    : "当前页面以服务端订单状态为准，请稍后刷新查看结果。"}
              </p>

              {failed && expired && (
                <p className="mt-5 border-l-2 border-earth pl-4 text-xs leading-5 text-earth">
                  支付时间已经结束，不能再次支付。超时任务会通过取消事务恢复库存。
                </p>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-5">
                {canRetry && (
                  <Link
                    href={`/account/orders/${encodeURIComponent(order.orderNumber)}/pay`}
                    className="inline-flex min-h-12 items-center bg-ink px-7 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
                  >
                    重试支付
                  </Link>
                )}
                <Link
                  href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
                  className="border-b border-ink pb-1 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth"
                >
                  查看订单详情
                </Link>
              </div>
            </div>

            <aside>
              <div className="flex items-center justify-between gap-5 border-t border-rule/80 pt-5">
                <span className="text-xs text-muted">订单状态</span>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="mt-5 flex items-end justify-between gap-5">
                <span className="text-xs text-muted">订单金额</span>
                <strong className="text-lg font-medium tabular-nums">
                  {formatPrice(order.totalAmount)}
                </strong>
              </div>
              <p className="mt-4 break-all text-[10px] leading-5 text-muted">
                {order.orderNumber}
              </p>
              <div className="mt-8">
                <h2 className="mb-3 text-sm font-medium text-ink">支付记录</h2>
                <PaymentHistory payments={order.payments} />
              </div>
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

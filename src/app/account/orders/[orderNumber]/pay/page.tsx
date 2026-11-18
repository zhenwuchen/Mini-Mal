import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PaymentFlow } from "@/components/orders/PaymentFlow";
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
  title: "模拟支付 | Mini Mal1",
  robots: { index: false, follow: false },
};

export default async function PayOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  await requireUser(
    `/account/orders/${encodeURIComponent(orderNumber)}/pay`,
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

  const expired = isOrderExpired(order.expiresAt, new Date());
  const payable = order.status === "PENDING_PAYMENT" && !expired;
  const idempotencyKey = randomUUID();

  return (
    <>
      <SkipLink />
      <Header />
      <main
        id="main-content"
        className="mx-auto w-full max-w-[980px] px-5 py-12 sm:px-8 sm:py-16 lg:px-12"
      >
        <Link
          href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
          className="text-[10px] font-medium tracking-[0.12em] text-muted uppercase transition-colors hover:text-ink"
        >
          返回订单详情
        </Link>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-b border-rule/80 pb-8">
          <div>
            <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
              Mock payment
            </p>
            <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em] sm:text-6xl">
              模拟支付
            </h1>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <p className="text-xs text-muted">订单编号</p>
            <p className="mt-2 break-all text-sm font-medium tracking-[0.03em] text-ink">
              {order.orderNumber}
            </p>

            <div className="mt-8 border-y border-rule/80 py-7">
              <div className="flex items-end justify-between gap-6">
                <span className="text-sm text-muted">应付金额</span>
                <strong className="text-3xl font-medium tabular-nums text-ink">
                  {formatPrice(order.totalAmount)}
                </strong>
              </div>
            </div>

            <div className="mt-8">
              {payable ? (
                <PaymentFlow
                  orderNumber={order.orderNumber}
                  idempotencyKey={idempotencyKey}
                  totalAmount={order.totalAmount}
                />
              ) : (
                <div className="border-l-2 border-earth bg-earth/5 px-5 py-4">
                  <p className="text-sm font-medium text-earth">
                    {expired
                      ? "支付时间已结束"
                      : "当前订单不可支付"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted">
                    {expired
                      ? "支付入口已关闭。订单状态和库存恢复由后台超时任务处理。"
                      : "这笔订单已经支付、取消或进入其他不可支付状态。"}
                  </p>
                </div>
              )}
            </div>
          </div>

          <aside className="border-t border-rule/80 pt-5">
            <h2 className="text-sm font-medium text-ink">支付记录</h2>
            <div className="mt-4">
              <PaymentHistory payments={order.payments} />
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}

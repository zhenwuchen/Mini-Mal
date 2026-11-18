import Link from "next/link";

import { CancelOrderButton } from "@/components/orders/CancelOrderButton";
import { PaymentHistory } from "@/components/orders/PaymentHistory";
import { isOrderExpired } from "@/lib/order-policy";
import type { OrderDetail } from "@/lib/order-query";

export function OrderPaymentPanel({ order }: { order: OrderDetail }) {
  const expired = isOrderExpired(order.expiresAt, new Date());
  const pendingPayment = order.status === "PENDING_PAYMENT";
  const hasFailure = order.payments.some(
    (payment) => payment.status === "FAILED",
  );

  return (
    <section
      aria-label="支付与订单操作"
      className="border border-rule/85 bg-paper p-6 sm:p-8"
    >
      <p className="text-[10px] font-medium tracking-[0.18em] text-earth uppercase">
        Payment
      </p>
      <h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">
        支付与订单
      </h2>

      {order.expiresAt && (
        <div className="mt-6 border-y border-rule/70 py-4">
          <p className="text-[10px] tracking-[0.1em] text-muted uppercase">
            支付截止时间
          </p>
          <p className="mt-1.5 text-sm text-ink">
            {formatOrderDate(order.expiresAt)}
          </p>
        </div>
      )}

      {pendingPayment ? (
        <div className="mt-5">
          {expired ? (
            <div className="border-l-2 border-earth pl-4">
              <p className="text-sm font-medium text-earth">
                支付时间已结束
              </p>
              <p className="mt-2 text-xs leading-5 text-muted">
                支付入口已关闭。订单将在后台超时任务处理，库存只由取消事务恢复。
              </p>
            </div>
          ) : (
            <>
              <Link
                href={`/account/orders/${encodeURIComponent(order.orderNumber)}/pay`}
                className="flex min-h-12 items-center justify-center bg-ink px-5 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
              >
                {hasFailure ? "重新支付" : "前往支付"}
              </Link>
              <p className="mt-4 text-xs leading-5 text-muted">
                订单会在截止时间前保持待付款状态。支付金额和状态由服务端校验。
              </p>
            </>
          )}

          <div className="mt-6 border-t border-rule/70 pt-4">
            <CancelOrderButton orderNumber={order.orderNumber} />
          </div>
        </div>
      ) : order.status === "PAID" ? (
        <p className="mt-5 border-l-2 border-ink pl-4 text-sm leading-6 text-ink">
          支付已完成，不能再次发起支付或直接取消订单。
        </p>
      ) : order.status === "CANCELLED" ? (
        <p className="mt-5 border-l-2 border-earth pl-4 text-sm leading-6 text-earth">
          订单已取消，库存恢复由现有取消事务完成，重复取消不会再次恢复库存。
        </p>
      ) : (
        <p className="mt-5 text-sm leading-6 text-muted">
          当前订单状态不支持用户侧支付或取消操作。
        </p>
      )}

      <div className="mt-8">
        <h3 className="mb-3 text-sm font-medium text-ink">支付记录</h3>
        <PaymentHistory payments={order.payments} />
      </div>
    </section>
  );
}

function formatOrderDate(date: Date) {
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

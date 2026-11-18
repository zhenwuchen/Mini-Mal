import type { OrderPaymentView } from "@/lib/order-query-core";
import { formatPrice } from "@/lib/catalog";

const paymentStatusLabels: Record<string, string> = {
  PENDING: "处理中",
  SUCCEEDED: "支付成功",
  FAILED: "支付失败",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
};

export function PaymentHistory({
  payments,
}: {
  payments: OrderPaymentView[];
}) {
  if (payments.length === 0) {
    return (
      <p className="border-y border-rule/80 py-5 text-xs leading-6 text-muted">
        尚未发起支付。
      </p>
    );
  }

  return (
    <ol className="border-t border-rule/80">
      {payments.map((payment) => (
        <li
          key={payment.id}
          className="border-b border-rule/70 py-4 text-xs"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-medium text-ink">
                {paymentStatusLabels[payment.status] ?? "状态未知"}
              </p>
              <p className="mt-1 text-[10px] tabular-nums text-muted">
                {formatPrice(payment.amount)} {payment.currency}
              </p>
              <time
                dateTime={payment.createdAt.toISOString()}
                className="mt-1 block text-[10px] text-muted"
              >
                {formatPaymentDate(payment.createdAt)}
              </time>
            </div>
            {payment.paidAt && (
              <span className="text-[10px] text-muted">
                完成于 {formatPaymentDate(payment.paidAt)}
              </span>
            )}
          </div>
          {payment.failureReason && (
            <p className="mt-2 leading-5 text-earth">
              {payment.failureReason}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function formatPaymentDate(date: Date) {
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

const paymentStatusLabels: Record<string, string> = {
  UNPAID: "未发起",
  PENDING: "处理中",
  SUCCEEDED: "已支付",
  FAILED: "支付失败",
  CANCELLED: "已取消",
  REFUNDED: "已退款",
};

const paymentStatusClasses: Record<string, string> = {
  UNPAID: "border-muted/25 bg-muted/5 text-muted",
  PENDING: "border-earth/30 bg-earth/7 text-earth",
  SUCCEEDED: "border-[#55735a]/30 bg-[#55735a]/7 text-[#49644e]",
  FAILED: "border-[#8b3f32]/30 bg-[#8b3f32]/6 text-[#713327]",
  CANCELLED: "border-muted/25 bg-muted/5 text-muted",
  REFUNDED: "border-rule bg-rule/20 text-muted",
};

export function AdminPaymentStatusBadge({
  status,
}: {
  status: string;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2.5 text-[9px] font-medium tracking-[0.08em] ${
        paymentStatusClasses[status] ??
        paymentStatusClasses.UNPAID
      }`}
    >
      {paymentStatusLabels[status] ?? "状态未知"}
    </span>
  );
}

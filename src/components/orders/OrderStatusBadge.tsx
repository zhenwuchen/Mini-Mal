import { getOrderStatusPresentation } from "@/lib/order-query-core";

const toneClassNames = {
  attention: "border-earth/35 bg-earth/8 text-earth",
  progress: "border-ink/20 bg-ink/5 text-ink",
  success: "border-ink/20 bg-ink/8 text-ink",
  neutral: "border-muted/25 bg-muted/5 text-muted",
} as const;

export function OrderStatusBadge({
  status,
}: {
  status: string;
}) {
  const presentation = getOrderStatusPresentation(status);

  return (
    <span
      className={`inline-flex min-h-7 items-center border px-3 text-[10px] font-medium tracking-[0.12em] ${toneClassNames[presentation.tone]}`}
    >
      {presentation.label}
    </span>
  );
}

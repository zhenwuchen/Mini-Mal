"use client";

import { useActionState, useState } from "react";

import { cancelOrderAction } from "@/app/actions/order";
import {
  initialOrderCancelActionState,
  type OrderCancelActionState,
} from "@/lib/order-cancel-action";

export function CancelOrderButton({
  orderNumber,
}: {
  orderNumber: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<
    OrderCancelActionState,
    FormData
  >(cancelOrderAction, initialOrderCancelActionState);

  return (
    <div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-xs text-muted">确认取消这笔订单？</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            className="min-h-9 text-xs text-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            返回
          </button>
          <form action={action}>
            <input type="hidden" name="orderNumber" value={orderNumber} />
            <button
              type="submit"
              disabled={pending}
              className="min-h-10 border border-earth px-4 text-[10px] font-medium tracking-[0.1em] text-earth uppercase transition-colors hover:bg-earth hover:text-white disabled:cursor-wait disabled:opacity-55"
            >
              {pending ? "正在取消…" : "确认取消"}
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-10 text-[10px] font-medium tracking-[0.1em] text-muted uppercase transition-colors hover:text-earth"
        >
          取消未支付订单
        </button>
      )}

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="mt-3 border-l-2 border-earth pl-3 text-xs leading-5 text-earth"
        >
          {state.message}
        </p>
      )}
    </div>
  );
}

"use client";

import { useActionState } from "react";

import {
  completePaymentAction,
  failPaymentAction,
  startPaymentAction,
} from "@/app/actions/payment";
import {
  initialPaymentActionState,
  type PaymentActionState,
} from "@/lib/payment-action";
import { formatPrice } from "@/lib/catalog";

export function PaymentFlow({
  orderNumber,
  idempotencyKey,
  totalAmount,
}: {
  orderNumber: string;
  idempotencyKey: string;
  totalAmount: number;
}) {
  const [startState, startAction, startPending] = useActionState<
    PaymentActionState,
    FormData
  >(startPaymentAction, initialPaymentActionState);
  const [completeState, completeAction, completePending] = useActionState<
    PaymentActionState,
    FormData
  >(completePaymentAction, initialPaymentActionState);
  const [failState, failAction, failPending] = useActionState<
    PaymentActionState,
    FormData
  >(failPaymentAction, initialPaymentActionState);
  const pendingPayment =
    startState.status === "pending" ? startState : null;
  const busy = startPending || completePending || failPending;
  const errorState = [completeState, failState, startState].find(
    (state) => state.status === "error",
  );

  return (
    <div>
      {!pendingPayment ? (
        <form action={startAction}>
          <input type="hidden" name="orderNumber" value={orderNumber} />
          <input
            type="hidden"
            name="idempotencyKey"
            value={idempotencyKey}
          />
          <button
            type="submit"
            disabled={startPending}
            className="min-h-13 w-full bg-ink px-6 py-4 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-wait disabled:bg-muted"
          >
            {startPending ? "正在创建支付请求…" : "发起模拟支付"}
          </button>
        </form>
      ) : (
        <div className="border border-ink bg-paper p-6 sm:p-7">
          <p className="text-[10px] font-medium tracking-[0.16em] text-earth uppercase">
            支付确认
          </p>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">
            确认支付 {formatPrice(pendingPayment.totalAmount ?? totalAmount)}
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted">
            支付金额、订单归属和可支付状态均由服务端再次校验。确认后将立即完成模拟支付。
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <form action={completeAction}>
              <input type="hidden" name="orderNumber" value={orderNumber} />
              <input
                type="hidden"
                name="paymentId"
                value={pendingPayment.paymentId}
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-12 w-full bg-ink px-5 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-wait disabled:bg-muted"
              >
                {completePending ? "正在确认…" : "确认支付"}
              </button>
            </form>

            <form action={failAction}>
              <input type="hidden" name="orderNumber" value={orderNumber} />
              <input
                type="hidden"
                name="paymentId"
                value={pendingPayment.paymentId}
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-12 w-full border border-rule px-5 text-[10px] font-medium tracking-[0.14em] text-ink uppercase transition-colors hover:border-earth hover:text-earth disabled:cursor-wait disabled:text-muted"
              >
                {failPending ? "正在结束…" : "模拟支付失败"}
              </button>
            </form>
          </div>
        </div>
      )}

      {errorState?.message && (
        <p
          role="alert"
          className="mt-5 border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm leading-6 text-earth"
        >
          {errorState.message}
        </p>
      )}

      <p className="mt-4 text-[11px] leading-5 text-muted">
        “模拟支付失败”用于验证失败结果和重试流程，不会调用真实资金渠道。
      </p>
    </div>
  );
}

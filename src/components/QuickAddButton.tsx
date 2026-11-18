"use client";

import {
  useEffect,
  useRef,
  type FormEvent,
} from "react";
import { useActionState } from "react";

import { addToCartAction } from "@/app/actions/cart";
import { PlusIcon } from "@/components/Icons";
import { initialAddToCartActionState } from "@/lib/cart-action-state";
import { canAddToCart } from "@/lib/product-purchase";

type QuickAddButtonProps = {
  productId: string;
  productName: string;
  stock: number;
  isActive: boolean;
  loginHref: string;
};

export function QuickAddButton({
  productId,
  productName,
  stock,
  isActive,
  loginHref,
}: QuickAddButtonProps) {
  const [state, formAction, pending] = useActionState(
    addToCartAction,
    initialAddToCartActionState,
  );
  const submissionLockRef = useRef(false);
  const canAdd = canAddToCart({
    isActive,
    stock,
    quantity: 1,
  });
  const unavailableLabel = !isActive
    ? "商品已下架"
    : stock <= 0
      ? "暂时缺货"
      : "加入购物袋";
  const feedback = pending
    ? "正在加入购物袋…"
    : state.status === "idle"
      ? ""
      : (state.message ?? "");
  const showLoginLink =
    !pending && state.status === "unauthenticated";
  const feedbackIsError =
    !pending &&
    (state.status === "error" ||
      state.status === "unauthenticated");

  useEffect(() => {
    submissionLockRef.current = false;
  }, [pending, state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submissionLockRef.current || pending || !canAdd) {
      event.preventDefault();
      return;
    }

    submissionLockRef.current = true;
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className={`absolute inset-x-0 bottom-0 z-20 transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 max-lg:translate-y-0 max-lg:opacity-100 ${
        feedback || pending
          ? "translate-y-0 opacity-100"
          : "translate-y-full opacity-0"
      }`}
    >
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value="1" />

      {feedback && (
        <p
          role={feedbackIsError ? "alert" : "status"}
          aria-live="polite"
          className={`border-t px-3 py-2 text-[10px] leading-4 ${
            feedbackIsError
              ? "border-earth/30 bg-[#f4e8df] text-[#713327]"
              : "border-ink/10 bg-paper text-ink"
          }`}
        >
          {feedback}
          {showLoginLink && (
            <>
              {" "}
              <a
                href={loginHref}
                className="border-b border-earth font-medium text-earth transition-colors hover:border-ink hover:text-ink"
              >
                前往登录
              </a>
            </>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={!canAdd || pending}
        aria-label={
          canAdd
            ? `将 ${productName} 加入购物袋`
            : `${productName} ${unavailableLabel}`
        }
        className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-ink/10 bg-canvas/95 px-4 py-3 text-[9px] font-medium tracking-[0.14em] text-ink uppercase backdrop-blur-sm transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:text-muted"
      >
        <PlusIcon className="size-3.5" />
        {pending
          ? "正在加入…"
          : feedback && state.status === "success"
            ? "已加入"
            : unavailableLabel}
      </button>
    </form>
  );
}

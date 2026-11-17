"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { addToCartAction } from "@/app/actions/cart";
import { MinusIcon, PlusIcon } from "@/components/Icons";
import { initialAddToCartActionState } from "@/lib/cart-action-state";
import {
  canAddToCart,
  getProductAvailability,
  getPurchaseQuantityLimit,
} from "@/lib/product-purchase";

type ProductPurchasePanelProps = {
  productId: string;
  stock: number;
  isActive: boolean;
  loginHref: string;
};

export function ProductPurchasePanel({
  productId,
  stock,
  isActive,
  loginHref,
}: ProductPurchasePanelProps) {
  const [quantity, setQuantity] = useState(1);
  const [state, formAction, pending] = useActionState(
    addToCartAction,
    initialAddToCartActionState,
  );
  const submissionLockRef = useRef(false);
  const quantityLimit = getPurchaseQuantityLimit(stock);
  const availability = getProductAvailability({ isActive, stock });
  const unavailable = availability !== "available";
  const purchaseAllowed = canAddToCart({ isActive, stock, quantity });
  const stateMatchesQuantity =
    state.status === "idle" || state.submittedQuantity === quantity;
  const feedback = pending
    ? "正在加入购物车…"
    : stateMatchesQuantity
      ? state.message
      : "";
  const feedbackIsError =
    stateMatchesQuantity &&
    (state.status === "error" || state.status === "unauthenticated");
  const showLoginLink =
    !pending &&
    stateMatchesQuantity &&
    state.status === "unauthenticated";
  const availabilityMessage =
    availability === "inactive"
      ? "该商品已下架，暂时无法购买。"
      : availability === "out-of-stock"
        ? "当前库存为 0，补货后可再次购买。"
        : `库存 ${stock} 件，单次最多可选择 ${quantityLimit} 件。`;

  useEffect(() => {
    submissionLockRef.current = false;
  }, [pending, state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submissionLockRef.current || pending) {
      event.preventDefault();
      return;
    }

    submissionLockRef.current = true;
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="quantity" value={quantity} />

      <div className="flex items-center justify-between gap-5 border-y border-rule/80 py-4">
        <p className="text-[10px] font-medium tracking-[0.16em] text-muted uppercase">
          数量
        </p>
        <div className="flex shrink-0 items-center border border-rule">
          <button
            type="button"
            aria-label="减少商品数量"
            disabled={quantity <= 1 || unavailable || pending}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            className="grid size-11 place-items-center text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:text-muted/40"
          >
            <MinusIcon className="size-3.5" />
          </button>
          <span
            className="grid min-w-10 place-items-center text-sm tabular-nums"
            aria-live="polite"
          >
            {quantity}
          </span>
          <button
            type="button"
            aria-label="增加商品数量"
            disabled={quantity >= quantityLimit || unavailable || pending}
            onClick={() =>
              setQuantity((value) =>
                Math.min(quantityLimit, Math.max(1, value + 1)),
              )
            }
            className="grid size-11 place-items-center text-ink transition-colors hover:bg-paper disabled:cursor-not-allowed disabled:text-muted/40"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        {availabilityMessage}
      </p>

      <button
        type="submit"
        disabled={!purchaseAllowed || pending}
        className="mt-5 min-h-13 w-full bg-ink px-6 py-4 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-not-allowed disabled:bg-muted/50"
      >
        {pending
          ? "正在加入…"
          : availability === "inactive"
            ? "商品已下架"
            : availability === "out-of-stock"
              ? "暂时缺货"
              : "加入购物车"}
      </button>
      <p
        role={feedbackIsError ? "alert" : "status"}
        aria-live="polite"
        className={`mt-3 min-h-5 text-xs leading-5 ${
          feedbackIsError ? "text-earth" : "text-muted"
        }`}
      >
        {feedback}
        {showLoginLink && (
          <>
            {" "}
            <a
              href={loginHref}
              className="border-b border-earth pb-0.5 font-medium text-earth transition-colors hover:border-ink hover:text-ink"
            >
              前往登录
            </a>
          </>
        )}
      </p>
    </form>
  );
}

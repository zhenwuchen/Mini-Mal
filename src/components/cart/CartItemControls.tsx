"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  removeCartItemAction,
  updateCartItemQuantityAction,
} from "@/app/actions/cart";
import { MinusIcon, PlusIcon } from "@/components/Icons";
import {
  initialCartMutationActionState,
  type CartMutationActionState,
} from "@/lib/cart-action-state";
import {
  canDecreaseCartQuantity,
  canIncreaseCartQuantity,
  cartLoginHref,
} from "@/lib/cart-page";

type CartItemControlsProps = {
  cartItemId: string;
  productName: string;
  quantity: number;
  stock: number;
  isActive: boolean;
};

function getVisibleFeedback(
  state: CartMutationActionState,
  cartItemId: string,
): CartMutationActionState | null {
  return state.status !== "idle" && state.cartItemId === cartItemId
    ? state
    : null;
}

export function CartItemControls({
  cartItemId,
  productName,
  quantity,
  stock,
  isActive,
}: CartItemControlsProps) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateCartItemQuantityAction,
    initialCartMutationActionState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeCartItemAction,
    initialCartMutationActionState,
  );
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [lastOperation, setLastOperation] = useState<"update" | "remove">(
    "update",
  );
  const updateLockRef = useRef(false);
  const removeLockRef = useRef(false);
  const busy = updatePending || removePending;
  const canDecrease =
    canDecreaseCartQuantity({ quantity, stock }) && !busy;
  const canIncrease =
    canIncreaseCartQuantity({ quantity, stock, isActive }) && !busy;
  const latestState =
    lastOperation === "remove" ? removeState : updateState;
  const feedback = getVisibleFeedback(latestState, cartItemId);
  const feedbackIsError =
    feedback?.status === "error" ||
    feedback?.status === "unauthenticated";
  const displayedMessage = updatePending
    ? "正在更新数量…"
    : removePending
      ? "正在移除商品…"
      : feedback?.message;

  useEffect(() => {
    if (!updatePending) {
      updateLockRef.current = false;
    }
  }, [updatePending, updateState]);

  useEffect(() => {
    if (!removePending) {
      removeLockRef.current = false;
    }
  }, [removePending, removeState]);

  function guardUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    if (updateLockRef.current || busy) {
      event.preventDefault();
      return;
    }

    updateLockRef.current = true;
    setLastOperation("update");
  }

  function guardRemoveSubmit(event: FormEvent<HTMLFormElement>) {
    if (removeLockRef.current || busy) {
      event.preventDefault();
      return;
    }

    removeLockRef.current = true;
    setLastOperation("remove");
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <form
          action={updateAction}
          onSubmit={guardUpdateSubmit}
          aria-label={`修改 ${productName} 的数量`}
        >
          <input type="hidden" name="cartItemId" value={cartItemId} />
          <div className="flex items-center border border-rule bg-paper">
            <button
              type="submit"
              name="quantity"
              value={quantity - 1}
              aria-label={`减少 ${productName} 的数量`}
              disabled={!canDecrease}
              className="grid size-11 place-items-center text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:text-muted/35"
            >
              <MinusIcon className="size-3.5" />
            </button>
            <span
              aria-live="polite"
              className="grid min-w-9 place-items-center text-sm tabular-nums text-ink sm:min-w-10"
            >
              {quantity}
            </span>
            <button
              type="submit"
              name="quantity"
              value={quantity + 1}
              aria-label={`增加 ${productName} 的数量`}
              disabled={!canIncrease}
              className="grid size-11 place-items-center text-ink transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:text-muted/35"
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
        </form>

        {confirmingRemove ? (
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span className="text-muted">确认移除？</span>
            <button
              type="button"
              disabled={busy}
              aria-label={`取消移除 ${productName}`}
              onClick={() => setConfirmingRemove(false)}
              className="min-h-9 text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
            <form action={removeAction} onSubmit={guardRemoveSubmit}>
              <input
                type="hidden"
                name="cartItemId"
                value={cartItemId}
              />
              <button
                type="submit"
                disabled={busy}
                aria-label={`确认删除 ${productName}`}
                className="min-h-9 border-b border-earth text-earth transition-colors hover:border-ink hover:text-ink disabled:cursor-wait disabled:opacity-55"
              >
                {removePending ? "正在移除…" : "确认删除"}
              </button>
            </form>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            aria-label={`移除 ${productName}`}
            onClick={() => setConfirmingRemove(true)}
            className="min-h-9 text-[11px] text-muted transition-colors hover:text-earth disabled:cursor-not-allowed disabled:opacity-50"
          >
            移除
          </button>
        )}
      </div>

      <p
        role={feedbackIsError ? "alert" : "status"}
        aria-live="polite"
        className={`mt-2 min-h-5 text-xs leading-5 ${
          feedbackIsError ? "text-earth" : "text-muted"
        }`}
      >
        {displayedMessage}
        {!busy && feedback?.status === "unauthenticated" && (
          <>
            {" "}
            <a
              href={cartLoginHref}
              className="border-b border-earth pb-0.5 font-medium text-earth transition-colors hover:border-ink hover:text-ink"
            >
              重新登录
            </a>
          </>
        )}
      </p>
    </div>
  );
}

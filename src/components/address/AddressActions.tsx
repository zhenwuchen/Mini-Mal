"use client";

import { useActionState, useState } from "react";

import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/app/actions/address";
import {
  initialAddressActionState,
  type AddressActionState,
} from "@/lib/address-action";

export function AddressActions({
  addressId,
  isDefault,
}: {
  addressId: string;
  isDefault: boolean;
}) {
  const [defaultState, defaultAction, defaultPending] = useActionState<
    AddressActionState,
    FormData
  >(setDefaultAddressAction, initialAddressActionState);
  const [deleteState, deleteAction, deletePending] = useActionState<
    AddressActionState,
    FormData
  >(deleteAddressAction, initialAddressActionState);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const busy = defaultPending || deletePending;
  const feedback =
    deleteState.status !== "idle" ? deleteState : defaultState;

  return (
    <div className="mt-6 border-t border-rule/70 pt-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {!isDefault && (
          <form action={defaultAction}>
            <input type="hidden" name="addressId" value={addressId} />
            <button
              type="submit"
              disabled={busy}
              className="min-h-9 border-b border-ink pb-0.5 text-[10px] font-medium tracking-[0.1em] text-ink uppercase transition-colors hover:border-earth hover:text-earth disabled:cursor-wait disabled:text-muted"
            >
              {defaultPending ? "正在设置…" : "设为默认"}
            </button>
          </form>
        )}

        {confirmingDelete ? (
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-muted">确认删除？</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirmingDelete(false)}
              className="min-h-9 text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              取消
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="addressId" value={addressId} />
              <button
                type="submit"
                disabled={busy}
                className="min-h-9 border-b border-earth text-[10px] font-medium tracking-[0.1em] text-earth uppercase transition-colors hover:border-ink hover:text-ink disabled:cursor-wait disabled:opacity-55"
              >
                {deletePending ? "正在删除…" : "确认删除"}
              </button>
            </form>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
            className="min-h-9 text-[10px] tracking-[0.08em] text-muted transition-colors hover:text-earth disabled:opacity-50"
          >
            删除
          </button>
        )}
      </div>

      <p
        role={feedback.status === "error" ? "alert" : "status"}
        aria-live="polite"
        className={`mt-3 min-h-5 text-xs leading-5 ${
          feedback.status === "error" ? "text-earth" : "text-muted"
        }`}
      >
        {feedback.message}
      </p>
    </div>
  );
}

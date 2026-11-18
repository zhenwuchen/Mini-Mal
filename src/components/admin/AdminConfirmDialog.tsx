"use client";

import {
  useEffect,
  useId,
  useRef,
} from "react";

type AdminConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  subject?: string;
  confirmLabel: string;
  pendingLabel: string;
  pending?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AdminConfirmDialog({
  open,
  title,
  description,
  subject,
  confirmLabel,
  pendingLabel,
  pending = false,
  error,
  onCancel,
  onConfirm,
}: AdminConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      dialog.showModal();
      cancelButtonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const closeAfterNativeDismiss = () => {
    if (open) {
      onCancel();
    }

    returnFocusRef.current?.focus();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={
        error ? `${descriptionId} ${errorId}` : descriptionId
      }
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();

        if (!pending) {
          onCancel();
        }
      }}
      onClose={closeAfterNativeDismiss}
      className="m-auto w-[min(520px,calc(100vw-2rem))] border border-ink/20 bg-paper p-0 text-ink shadow-[0_28px_90px_rgba(33,29,25,0.28)] backdrop:bg-[#211d19]/65 backdrop:backdrop-blur-[2px]"
    >
      <div className="border-t-4 border-[#8b3f32] p-6 sm:p-7">
        <p className="text-[9px] font-medium tracking-[0.16em] text-[#8b3f32] uppercase">
          Confirm action
        </p>
        <h2
          id={titleId}
          className="mt-3 font-serif text-3xl tracking-[-0.045em]"
        >
          {title}
        </h2>
        <p
          id={descriptionId}
          className="mt-4 text-sm leading-7 text-muted"
        >
          {description}
        </p>

        {subject && (
          <div className="mt-5 border border-rule bg-[#f2eee7] px-4 py-3">
            <p className="text-[9px] tracking-[0.1em] text-muted">
              当前对象
            </p>
            <p className="mt-1 break-words text-sm font-medium text-ink">
              {subject}
            </p>
          </div>
        )}

        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-5 border-l-2 border-[#8b3f32] bg-[#8b3f32]/6 px-3 py-2.5 text-xs leading-5 text-[#713327]"
          >
            {error}
          </p>
        )}

        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="inline-flex min-h-11 items-center justify-center border border-rule bg-paper px-5 text-[11px] font-medium tracking-[0.08em] text-ink transition-colors hover:border-ink disabled:cursor-wait disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center border border-[#8b3f32] bg-[#8b3f32] px-5 text-[11px] font-medium tracking-[0.08em] text-white transition-colors hover:border-[#713327] hover:bg-[#713327] disabled:cursor-wait disabled:opacity-55"
          >
            {pending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

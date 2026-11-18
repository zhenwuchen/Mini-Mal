"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { AdminConfirmDialog } from "@/components/admin/AdminConfirmDialog";
import { useAdminFeedback } from "@/components/admin/AdminFeedback";
import {
  initialAdminActionState,
  type AdminActionState,
} from "@/lib/admin-action-state";

type AdminServerAction = (
  previousState: AdminActionState,
  formData: FormData,
) => Promise<AdminActionState>;

type AdminMutationButtonProps = {
  action: AdminServerAction;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger" | "dangerQuiet" | "quiet";
  fullWidth?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  confirmation?: {
    title: string;
    description: string;
    subject?: string;
    confirmLabel: string;
  };
};

const variants = {
  primary:
    "border-ink bg-ink text-white hover:border-earth hover:bg-earth",
  secondary:
    "border-rule bg-paper text-ink hover:border-ink",
  danger:
    "border-[#8b3f32]/35 bg-[#8b3f32]/6 text-[#713327] hover:border-[#8b3f32] hover:bg-[#8b3f32] hover:text-white",
  dangerQuiet:
    "border-transparent bg-transparent text-[#8b3f32] hover:border-[#8b3f32]/25 hover:bg-[#8b3f32]/6",
  quiet:
    "border-transparent bg-transparent text-muted hover:text-earth",
} as const;

export function AdminMutationButton({
  action,
  fields,
  label,
  pendingLabel,
  variant = "secondary",
  fullWidth = false,
  disabled = false,
  disabledReason,
  confirmation,
}: AdminMutationButtonProps) {
  const router = useRouter();
  const { showFeedback } = useAdminFeedback();
  const [state, formAction, pending] = useActionState(
    action,
    initialAdminActionState,
  );
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const handledStateRef = useRef<AdminActionState | null>(null);
  const submitLockRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorId = useId();

  useEffect(() => {
    if (!pending) {
      submitLockRef.current = false;
    }
  }, [pending]);

  useEffect(() => {
    if (
      state.status !== "success" ||
      !state.message ||
      handledStateRef.current === state
    ) {
      return;
    }

    handledStateRef.current = state;
    setOpen(false);
    setSubmitted(false);
    showFeedback("success", state.message);

    const currentUrl = new URL(window.location.href);

    if (currentUrl.searchParams.has("message")) {
      currentUrl.searchParams.delete("message");
      router.replace(
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
        { scroll: false },
      );
      return;
    }

    router.refresh();
  }, [router, showFeedback, state]);

  function submit() {
    if (pending || disabled || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setSubmitted(true);

    try {
      formRef.current?.requestSubmit();
    } catch {
      submitLockRef.current = false;
    }
  }

  const buttonClassName =
    `inline-flex min-h-11 items-center justify-center border px-3 py-2.5 text-[10px] font-medium tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      variants[variant]
    } ${fullWidth ? "w-full" : ""}`;

  return (
    <>
      <form ref={formRef} action={formAction} className="hidden">
        {Object.entries(fields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      </form>

      <button
        type="button"
        disabled={pending || disabled}
        aria-describedby={
          disabled && disabledReason ? errorId : undefined
        }
        aria-haspopup={confirmation ? "dialog" : undefined}
        aria-expanded={confirmation ? open : undefined}
        onClick={() => {
          if (confirmation) {
            setSubmitted(false);
            setOpen(true);
            return;
          }

          submit();
        }}
        className={buttonClassName}
      >
        {pending ? pendingLabel : label}
      </button>

      {disabled && disabledReason && (
        <p
          id={errorId}
          className="mt-2 max-w-[220px] text-[10px] leading-4 text-muted"
        >
          {disabledReason}
        </p>
      )}

      {!confirmation && state.status === "error" && state.message && (
        <p
          role="alert"
          className="mt-2 max-w-[220px] text-[10px] leading-4 text-[#713327]"
        >
          {state.message}
        </p>
      )}

      {confirmation && (
        <AdminConfirmDialog
          open={open}
          title={confirmation.title}
          description={confirmation.description}
          subject={confirmation.subject}
          confirmLabel={confirmation.confirmLabel}
          pendingLabel={pendingLabel}
          pending={pending}
          error={
            submitted && state.status === "error"
              ? state.message
              : undefined
          }
          onCancel={() => {
            if (!pending) {
              setSubmitted(false);
              setOpen(false);
            }
          }}
          onConfirm={submit}
        />
      )}
    </>
  );
}

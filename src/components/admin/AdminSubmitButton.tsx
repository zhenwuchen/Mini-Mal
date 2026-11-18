"use client";

import { useFormStatus } from "react-dom";

type AdminSubmitButtonProps = {
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "quiet";
  fullWidth?: boolean;
  disabled?: boolean;
};

const variants = {
  primary:
    "border-ink bg-ink text-white hover:border-earth hover:bg-earth",
  secondary:
    "border-rule bg-paper text-ink hover:border-ink",
  danger:
    "border-[#8b3f32]/35 bg-[#8b3f32]/6 text-[#713327] hover:border-[#8b3f32] hover:bg-[#8b3f32] hover:text-white",
  quiet:
    "border-transparent bg-transparent text-muted hover:text-earth",
} as const;

export function AdminSubmitButton({
  label,
  pendingLabel = "处理中…",
  variant = "primary",
  fullWidth = false,
  disabled = false,
}: AdminSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`inline-flex min-h-11 items-center justify-center border px-5 py-2.5 text-[11px] font-medium tracking-[0.08em] transition-colors disabled:cursor-wait disabled:opacity-55 ${
        variants[variant]
      } ${fullWidth ? "w-full" : ""}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

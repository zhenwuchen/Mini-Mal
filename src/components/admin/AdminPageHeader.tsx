import type { ReactNode } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-rule pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[9px] font-medium tracking-[0.2em] text-earth uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-3 font-serif text-[2.6rem] leading-none tracking-[-0.055em] text-ink sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 max-w-[620px] text-[13px] leading-6 text-muted">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </header>
  );
}

export function AdminFlashMessage({
  children,
  tone = "success",
}: {
  children: ReactNode;
  tone?: "success" | "error";
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`border-l-2 px-4 py-3 text-sm leading-6 ${
        tone === "error"
          ? "border-[#8b3f32] bg-[#8b3f32]/6 text-[#713327]"
          : "border-earth bg-earth/6 text-ink"
      }`}
    >
      {children}
    </p>
  );
}

export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-y border-rule py-16 text-center sm:py-20">
      <p className="font-serif text-3xl tracking-[-0.04em] text-ink">
        {title}
      </p>
      <p className="mx-auto mt-4 max-w-[420px] text-sm leading-7 text-muted">
        {description}
      </p>
      {action && <div className="mt-7">{action}</div>}
    </div>
  );
}

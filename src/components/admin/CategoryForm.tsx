"use client";

import {
  cloneElement,
  isValidElement,
  useActionState,
  type ReactElement,
} from "react";

import { saveCategoryAction } from "@/app/admin/actions";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import {
  initialAdminActionState,
} from "@/lib/admin-action-state";
import type { AdminCategorySummary } from "@/lib/admin-category-service";
import { useFormValuePreservation } from "@/lib/form-value-preservation";

export function CategoryForm({
  category,
  compact = false,
}: {
  category?: AdminCategorySummary;
  compact?: boolean;
}) {
  const [state, formAction] = useActionState(
    saveCategoryAction,
    initialAdminActionState,
  );
  const { formRef, preserveSubmittedValues } =
    useFormValuePreservation(
      state.status === "error" ? state : null,
    );
  const idPrefix = category ? `category-${category.id}` : "new-category";

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={preserveSubmittedValues}
      className="space-y-5"
    >
      {category && (
        <input
          type="hidden"
          name="categoryId"
          value={category.id}
        />
      )}

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="border-l-2 border-[#8b3f32] bg-[#8b3f32]/6 px-3 py-2.5 text-xs leading-5 text-[#713327]"
        >
          {state.message}
        </p>
      )}

      <div className={compact ? "space-y-4" : "grid gap-5 lg:grid-cols-2"}>
        <CategoryField
          id={`${idPrefix}-name`}
          label="分类名称"
          required
          error={state.fieldErrors?.name}
        >
          <input
            id={`${idPrefix}-name`}
            name="name"
            type="text"
            required
            maxLength={60}
            defaultValue={category?.name ?? ""}
            className={inputClassName(state.fieldErrors?.name)}
          />
        </CategoryField>

        <CategoryField
          id={`${idPrefix}-slug`}
          label="分类标识"
          hint="小写字母、数字和连字符"
          required
          error={state.fieldErrors?.slug}
        >
          <input
            id={`${idPrefix}-slug`}
            name="slug"
            type="text"
            required
            maxLength={64}
            defaultValue={category?.slug ?? ""}
            placeholder="home-fragrance"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            autoCapitalize="none"
            spellCheck={false}
            className={inputClassName(state.fieldErrors?.slug)}
          />
        </CategoryField>

        <CategoryField
          id={`${idPrefix}-description`}
          label="分类说明"
          hint="最多 300 个字符"
          error={state.fieldErrors?.description}
          className={compact ? "" : "lg:col-span-2"}
        >
          <textarea
            id={`${idPrefix}-description`}
            name="description"
            rows={compact ? 2 : 4}
            maxLength={300}
            defaultValue={category?.description ?? ""}
            className={`${inputClassName(
              state.fieldErrors?.description,
            )} resize-y leading-6`}
          />
        </CategoryField>
      </div>

      <AdminSubmitButton
        label={category ? "保存分类" : "新增分类"}
        pendingLabel="保存中…"
      />
    </form>
  );
}

function CategoryField({
  id,
  label,
  hint,
  error,
  required = false,
  className = "",
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-[11px] font-medium tracking-[0.08em] text-ink"
      >
        {label}
        {required && (
          <span
            aria-hidden="true"
            className="ml-2 align-middle text-[9px] font-normal tracking-[0.08em] text-[#8b3f32]"
          >
            必填
          </span>
        )}
      </label>
      {hint && (
        <p className="mt-1.5 text-[10px] leading-5 text-muted">{hint}</p>
      )}
      <div className="mt-2">
        {withFieldAria(children, id, Boolean(error))}
      </div>
      {error && (
        <p
          id={`${id}-error`}
          className="mt-2 text-xs leading-5 text-[#8b3f32]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function withFieldAria(
  children: React.ReactNode,
  id: string,
  hasError: boolean,
) {
  if (!isValidElement(children)) {
    return children;
  }

  return cloneElement(
    children as ReactElement<{
      "aria-describedby"?: string;
      "aria-invalid"?: boolean;
    }>,
    {
      "aria-describedby": hasError ? `${id}-error` : undefined,
      "aria-invalid": hasError ? true : undefined,
    },
  );
}

function inputClassName(error?: string) {
  return `min-h-11 w-full border bg-paper px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted/55 focus:border-earth ${
    error ? "border-[#8b3f32]" : "border-rule"
  }`;
}

"use client";

import { useActionState } from "react";

import { updateProfileAction } from "@/app/actions/profile";
import {
  initialProfileActionState,
} from "@/lib/profile-action-state";
import { useFormValuePreservation } from "@/lib/form-value-preservation";

export function ProfileForm({
  name,
}: {
  name: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialProfileActionState,
  );
  const { formRef, preserveSubmittedValues } =
    useFormValuePreservation(
      state.status === "error" ? state : null,
    );

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={preserveSubmittedValues}
      noValidate
    >
      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="mb-7 border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm leading-6 text-earth"
        >
          {state.message}
        </p>
      )}

      <label
        htmlFor="profile-name"
        className="block text-sm font-medium text-ink"
      >
        展示名称
      </label>
      <p className="mt-2 text-xs leading-5 text-muted">
        可留空；留空后会使用“Mini Mal1 会员”作为页面称呼。
      </p>
      <input
        id="profile-name"
        name="name"
        type="text"
        maxLength={60}
        autoComplete="name"
        defaultValue={name ?? ""}
        aria-invalid={state.status === "error"}
        aria-describedby="profile-name-note"
        className="mt-3 min-h-12 w-full border border-rule bg-paper px-4 text-sm text-ink transition-colors placeholder:text-muted/55 hover:border-ink/40 focus-visible:border-earth"
      />
      <p
        id="profile-name-note"
        className="mt-2 text-[10px] leading-5 text-muted"
      >
        邮箱、登录凭证和账户角色由认证系统管理，不能在此修改。
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mt-8 min-h-12 bg-ink px-7 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-wait disabled:bg-muted"
      >
        {pending ? "正在保存…" : "保存资料"}
      </button>
    </form>
  );
}

"use client";

import { useActionState } from "react";

import { registerAction } from "@/app/actions/auth";
import { initialAuthActionState } from "@/lib/auth-action-state";

const inputClassName =
  "mt-2 min-h-12 w-full border border-rule bg-paper px-4 text-sm text-ink transition-colors placeholder:text-muted/55 hover:border-ink/40 focus-visible:border-earth";

type RegisterFormProps = {
  returnTo: string;
};

export function RegisterForm({ returnTo }: RegisterFormProps) {
  const [state, action, pending] = useActionState(
    registerAction,
    initialAuthActionState,
  );
  const errors = state.fieldErrors;

  return (
    <form action={action} noValidate>
      <div className="mb-8">
        <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
          Create account
        </p>
        <h2 className="mt-3 font-serif text-4xl tracking-[-0.045em]">
          创建账户
        </h2>
      </div>

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="mb-6 border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm leading-6 text-earth"
        >
          {state.message}
        </p>
      )}

      <input type="hidden" name="returnTo" value={returnTo} />

      <div>
        <label htmlFor="register-name" className="text-sm font-medium text-ink">
          用户名
        </label>
        <input
          id="register-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="你的称呼"
          required
          aria-invalid={Boolean(errors?.name)}
          aria-describedby={errors?.name ? "register-name-error" : undefined}
          className={inputClassName}
        />
        {errors?.name && (
          <p
            id="register-name-error"
            className="mt-2 text-xs leading-5 text-earth"
          >
            {errors.name}
          </p>
        )}
      </div>

      <div className="mt-5">
        <label htmlFor="register-email" className="text-sm font-medium text-ink">
          邮箱
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="name@example.com"
          required
          aria-invalid={Boolean(errors?.email)}
          aria-describedby={errors?.email ? "register-email-error" : undefined}
          className={inputClassName}
        />
        {errors?.email && (
          <p
            id="register-email-error"
            className="mt-2 text-xs leading-5 text-earth"
          >
            {errors.email}
          </p>
        )}
      </div>

      <div className="mt-5">
        <label
          htmlFor="register-password"
          className="text-sm font-medium text-ink"
        >
          密码
        </label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors?.password)}
          aria-describedby={
            errors?.password
              ? "register-password-error register-password-hint"
              : "register-password-hint"
          }
          className={inputClassName}
        />
        <p
          id="register-password-hint"
          className="mt-2 text-[11px] leading-5 text-muted"
        >
          至少 10 位，并同时包含字母、数字和特殊字符。
        </p>
        {errors?.password && (
          <p
            id="register-password-error"
            className="mt-2 text-xs leading-5 text-earth"
          >
            {errors.password}
          </p>
        )}
      </div>

      <div className="mt-5">
        <label
          htmlFor="register-confirm-password"
          className="text-sm font-medium text-ink"
        >
          确认密码
        </label>
        <input
          id="register-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(errors?.confirmPassword)}
          aria-describedby={
            errors?.confirmPassword
              ? "register-confirm-password-error"
              : undefined
          }
          className={inputClassName}
        />
        {errors?.confirmPassword && (
          <p
            id="register-confirm-password-error"
            className="mt-2 text-xs leading-5 text-earth"
          >
            {errors.confirmPassword}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-7 min-h-13 w-full bg-ink px-6 py-4 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-wait disabled:bg-muted"
      >
        {pending ? "正在创建…" : "创建账户"}
      </button>

      <p className="mt-4 text-[11px] leading-5 text-muted">
        注册账户默认为普通用户。管理员角色仅由服务端数据库决定。
      </p>
    </form>
  );
}

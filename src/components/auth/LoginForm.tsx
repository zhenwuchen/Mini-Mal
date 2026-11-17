"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction } from "@/app/actions/auth";
import { initialAuthActionState } from "@/lib/auth-action-state";

const inputClassName =
  "mt-2 min-h-12 w-full border border-rule bg-paper px-4 text-sm text-ink transition-colors placeholder:text-muted/55 hover:border-ink/40 focus-visible:border-earth";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const [state, action, pending] = useActionState(
    loginAction,
    initialAuthActionState,
  );
  const registerHref =
    returnTo === "/"
      ? "/register"
      : `/register?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <form action={action} noValidate>
      <div className="mb-9">
        <p className="text-[10px] font-medium tracking-[0.18em] text-muted uppercase">
          Sign in
        </p>
        <h2 className="mt-3 font-serif text-4xl tracking-[-0.045em]">
          登录账户
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
        <label htmlFor="login-email" className="text-sm font-medium text-ink">
          邮箱
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="name@example.com"
          required
          className={inputClassName}
        />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-4">
          <label
            htmlFor="login-password"
            className="text-sm font-medium text-ink"
          >
            密码
          </label>
          <Link
            href={registerHref}
            className="text-[10px] tracking-[0.08em] text-muted transition-colors hover:text-ink"
          >
            还没有账户？
          </Link>
        </div>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={inputClassName}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-7 min-h-13 w-full bg-ink px-6 py-4 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-wait disabled:bg-muted"
      >
        {pending ? "正在登录…" : "安全登录"}
      </button>

      <p className="mt-4 text-center text-[11px] leading-5 text-muted">
        登录状态由服务端签名 Cookie 验证。
      </p>
    </form>
  );
}

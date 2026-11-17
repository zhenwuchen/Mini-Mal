"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/auth";
import {
  initialAuthActionState,
  type AuthActionState,
} from "@/lib/auth-action-state";
import { registerUser } from "@/lib/auth-service";
import {
  normalizeEmail,
  sanitizeAuthRedirect,
} from "@/lib/auth-validation";

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const returnTo = sanitizeAuthRedirect(
    String(formData.get("returnTo") ?? "/"),
  );
  const result = await registerUser({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!result.success) {
    return {
      status: "error",
      message: "请检查注册信息",
      fieldErrors: result.fieldErrors,
    };
  }

  const loginParams = new URLSearchParams({ registered: "1" });

  if (returnTo !== "/") {
    loginParams.set("returnTo", returnTo);
  }

  redirect(`/login?${loginParams.toString()}`);
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const returnTo = sanitizeAuthRedirect(
    String(formData.get("returnTo") ?? "/"),
  );

  if (!email || !password) {
    return {
      ...initialAuthActionState,
      status: "error",
      message: "邮箱或密码不正确",
    };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: returnTo,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        message: "邮箱或密码不正确",
      };
    }

    throw error;
  }

  return initialAuthActionState;
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect("/login?loggedOut=1");
}

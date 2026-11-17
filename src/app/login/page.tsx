import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { sanitizeAuthRedirect } from "@/lib/auth-validation";
import { getCurrentUser } from "@/lib/auth-session";

export const instant = false;

export const metadata: Metadata = {
  title: "登录账户 | Mini Mal1",
  description: "登录 Mini Mal1 账户，继续浏览与选购精选日常好物。",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const returnTo = sanitizeAuthRedirect(
    typeof params.returnTo === "string" ? params.returnTo : "/",
  );
  const user = await getCurrentUser();

  if (user) {
    redirect(returnTo);
  }

  const notice =
    params.registered === "1"
      ? "账户创建成功，请使用新账户登录。"
      : params.loggedOut === "1"
        ? "已安全退出当前账户。"
        : null;

  return (
    <AuthPageShell
      eyebrow="Member access"
      title="回到你的日常清单。"
      description="登录后可安全恢复账户身份。Mini Mal1 只在服务端读取 Session，不会依据客户端状态判断你的权限。"
      note="你的密码不会以明文保存。登录 Cookie 使用 HttpOnly，并在生产环境的 HTTPS 连接中启用 Secure。"
      alternateLabel="第一次来到这里？"
      alternateText="创建账户"
      alternateHref={
        returnTo === "/"
          ? "/register"
          : `/register?returnTo=${encodeURIComponent(returnTo)}`
      }
    >
      {notice && (
        <p
          role="status"
          className="mb-7 border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm leading-6 text-earth"
        >
          {notice}
        </p>
      )}
      <LoginForm returnTo={returnTo} />
    </AuthPageShell>
  );
}

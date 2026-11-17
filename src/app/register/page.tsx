import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { sanitizeAuthRedirect } from "@/lib/auth-validation";
import { getCurrentUser } from "@/lib/auth-session";

export const instant = false;

export const metadata: Metadata = {
  title: "创建账户 | Mini Mal1",
  description: "创建 Mini Mal1 账户，保存你的身份与后续购物体验。",
};

export default async function RegisterPage({
  searchParams,
}: PageProps<"/register">) {
  const params = await searchParams;
  const returnTo = sanitizeAuthRedirect(
    typeof params.returnTo === "string" ? params.returnTo : "/",
  );
  const user = await getCurrentUser();

  if (user) {
    redirect(returnTo);
  }

  return (
    <AuthPageShell
      eyebrow="New membership"
      title="为你的日常，留一个位置。"
      description="创建账户后，你的身份会由服务端安全验证。我们只保留必要资料，密码会经过 bcrypt 哈希后写入数据库。"
      note="邮箱用于登录和后续账户服务。注册不会获得管理员权限，普通用户角色由服务端固定写入。"
      alternateLabel="已经有账户？"
      alternateText="返回登录"
      alternateHref={
        returnTo === "/"
          ? "/login"
          : `/login?returnTo=${encodeURIComponent(returnTo)}`
      }
    >
      <RegisterForm returnTo={returnTo} />
    </AuthPageShell>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/actions/auth";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";
import { requireUser } from "@/lib/auth-session";
import { createProfileService } from "@/lib/profile-service";
import { prisma } from "@/lib/prisma";

export const instant = false;

export const metadata: Metadata = {
  title: "我的账户 | Mini Mal1",
  robots: {
    index: false,
    follow: false,
  },
};

const profileService = createProfileService({ prisma });

export default async function AccountPage() {
  const user = await requireUser("/account");
  const profile = await profileService.getProfile(user.id);
  const displayName = profile.name ?? "Mini Mal1 会员";

  if (!user) {
    redirect("/login?returnTo=%2Faccount");
  }

  return (
    <>
      <SkipLink />
      <Header />
      <main
        id="main-content"
        className="mx-auto min-h-[64vh] w-full max-w-[1440px] px-5 py-14 sm:px-8 sm:py-20 lg:px-12 xl:px-16"
      >
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
              Your account
            </p>
            <h1 className="mt-5 font-serif text-5xl leading-[1] tracking-[-0.05em] text-balance sm:text-7xl">
              你好，{displayName}。
            </h1>
            <p className="mt-6 max-w-[520px] text-sm leading-7 text-muted">
              当前身份由服务端 Session 验证。这里不会根据浏览器提交的角色字段判断权限。
            </p>
          </div>

          <div className="border-y border-rule/80 py-6">
            <dl className="grid gap-5 text-sm">
              <div className="flex items-start justify-between gap-6">
                <dt className="text-muted">邮箱</dt>
                <dd className="min-w-0 break-all text-right text-ink">
                  {user.email}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-6">
                <dt className="text-muted">账户角色</dt>
                <dd className="inline-flex min-h-7 items-center border border-earth/35 bg-earth/8 px-3 text-[10px] font-medium tracking-[0.12em] text-earth">
                  {user.role === "ADMIN" ? "管理员" : "普通用户"}
                </dd>
              </div>
            </dl>

            <form action={logoutAction} className="mt-7">
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/account/orders"
                  className="inline-flex min-h-11 items-center border border-ink px-5 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:bg-ink hover:text-white"
                >
                  我的订单
                </Link>
                <Link
                  href="/account/addresses"
                  className="inline-flex min-h-11 items-center border border-rule px-5 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-ink"
                >
                  收货地址
                </Link>
                <Link
                  href="/account/profile"
                  className="inline-flex min-h-11 items-center border border-rule px-5 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-ink"
                >
                  编辑资料
                </Link>
                <button
                  type="submit"
                  className="min-h-11 px-5 text-[10px] font-medium tracking-[0.14em] text-muted uppercase transition-colors hover:text-earth"
                >
                  退出登录
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

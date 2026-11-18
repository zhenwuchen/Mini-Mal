import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ProfileForm } from "@/components/ProfileForm";
import { SkipLink } from "@/components/SkipLink";
import { requireUser } from "@/lib/auth-session";
import { createProfileService } from "@/lib/profile-service";
import { prisma } from "@/lib/prisma";

export const instant = false;

export const metadata: Metadata = {
  title: "编辑个人资料 | Mini Mal1",
  robots: {
    index: false,
    follow: false,
  },
};

const profileService = createProfileService({ prisma });

export default async function ProfilePage({
  searchParams,
}: PageProps<"/account/profile">) {
  const sessionUser = await requireUser("/account/profile");
  const [profile, query] = await Promise.all([
    profileService.getProfile(sessionUser.id),
    searchParams,
  ]);

  return (
    <>
      <SkipLink />
      <Header />
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1040px] px-5 py-12 sm:px-8 sm:py-16 lg:px-12"
      >
        <nav
          aria-label="面包屑"
          className="flex flex-wrap items-center gap-3 text-[10px] tracking-[0.1em] text-muted uppercase"
        >
          <Link href="/account" className="transition-colors hover:text-ink">
            我的账户
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">个人资料</span>
        </nav>

        <div className="mt-10 grid gap-10 border-t border-rule/80 pt-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
          <div>
            <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
              Profile settings
            </p>
            <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em] sm:text-6xl">
              个人资料
            </h1>
            <p className="mt-5 max-w-[360px] text-sm leading-7 text-muted">
              更新展示名称只会影响当前登录账户。身份、邮箱和权限仍由服务端 Session
              决定。
            </p>
          </div>

          <section className="border border-rule bg-paper p-6 sm:p-8">
            {query.saved === "1" && (
              <p
                role="status"
                className="mb-7 border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm leading-6 text-ink"
              >
                个人资料已保存，页面显示已更新。
              </p>
            )}

            <dl className="mb-8 grid gap-5 border-b border-rule/80 pb-7 text-sm">
              <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-4">
                <dt className="text-muted">邮箱</dt>
                <dd className="break-all text-right text-ink">
                  {profile.email}
                </dd>
              </div>
              <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-4">
                <dt className="text-muted">账户角色</dt>
                <dd className="text-right text-ink">
                  {profile.role === "ADMIN" ? "管理员" : "普通用户"}
                </dd>
              </div>
            </dl>

            <ProfileForm name={profile.name} />

            <div className="mt-8 border-t border-rule/80 pt-6">
              <Link
                href="/account"
                className="border-b border-ink pb-1 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth"
              >
                返回我的账户
              </Link>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

import { logoutAction } from "@/app/actions/auth";
import { AdminFeedbackProvider } from "@/components/admin/AdminFeedback";
import { AdminNav } from "@/components/admin/AdminNav";
import { SkipLink } from "@/components/SkipLink";
import { requireAdmin } from "@/lib/auth-session";

export const instant = false;

export const metadata: Metadata = {
  title: {
    default: "运营后台 | Mini Mal1",
    template: "%s | Mini Mal1 后台",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  const user = await requireAdmin("/admin");

  return (
    <AdminFeedbackProvider>
      <div className="min-h-screen bg-[#f2eee7]">
      <SkipLink />
      <aside className="bg-[#211d19] text-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[264px] lg:flex-col">
        <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 lg:mx-0 lg:flex lg:h-full lg:max-w-none lg:flex-col lg:px-5 lg:py-7">
          <div className="flex items-center justify-between gap-5 lg:block">
            <Link
              href="/admin"
              className="inline-flex items-baseline gap-2"
            >
              <span className="font-serif text-2xl tracking-[-0.05em]">
                Mini Mal1
              </span>
              <span className="text-[9px] font-medium tracking-[0.14em] text-[#c8a988]">
                ADMIN
              </span>
            </Link>
            <Link
              href="/"
              className="text-[10px] tracking-[0.08em] text-white/56 transition-colors hover:text-white lg:hidden"
            >
              返回商城
            </Link>
          </div>

          <p className="mt-3 hidden max-w-[200px] text-[10px] leading-5 text-white/38 lg:block">
            商品、分类与订单的真实运营数据都在这里完成。
          </p>

          <div className="mt-3 lg:mt-10">
            <AdminNav />
          </div>

          <div className="mt-auto hidden border-t border-white/12 pt-6 lg:block">
            <p className="text-[9px] tracking-[0.12em] text-white/36">
              当前管理员
            </p>
            <p className="mt-2 truncate text-sm text-white/86">
              {user.name ?? user.email}
            </p>
            <p className="mt-1 truncate text-[10px] text-white/38">
              {user.email}
            </p>
            <div className="mt-5 flex items-center justify-between gap-3">
              <Link
                href="/"
                className="text-[10px] tracking-[0.08em] text-white/56 transition-colors hover:text-white"
              >
                查看商城
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="min-h-9 text-[10px] tracking-[0.08em] text-white/42 transition-colors hover:text-white"
                >
                  退出登录
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>

      <main
        id="main-content"
        className="min-w-0 lg:ml-[264px]"
      >
        <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-7 sm:py-9 lg:px-10 lg:py-10 xl:px-14">
          {children}
        </div>
      </main>
      </div>
    </AdminFeedbackProvider>
  );
}

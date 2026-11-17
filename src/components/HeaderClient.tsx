"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { logoutAction } from "@/app/actions/auth";
import {
  BagIcon,
  CloseIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
} from "@/components/Icons";
import type { UserRole } from "@/lib/auth-service";
import {
  formatCartBadgeQuantity,
  getCartAriaLabel,
} from "@/lib/header-cart";

const navItems = [
  { label: "首页", href: "/" },
  { label: "全部商品", href: "/products" },
  { label: "商品分类", href: "/#categories" },
  { label: "品牌故事", href: "/#story" },
];

export type HeaderUser = {
  name: string | null;
  email: string;
  role: UserRole;
};

type HeaderClientProps = {
  user: HeaderUser | null;
  cartQuantity: number;
  sessionPending?: boolean;
};

export function HeaderClient({
  user,
  cartQuantity,
  sessionPending = false,
}: HeaderClientProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const cartBadge = formatCartBadgeQuantity(cartQuantity);

  useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      menuButton?.focus();
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-rule/70 bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto grid h-16 w-full max-w-[1440px] grid-cols-[1fr_auto] items-center px-5 sm:px-8 md:h-[72px] lg:grid-cols-[1fr_auto_1fr] lg:px-12 xl:px-16">
        <Link
          href="/"
          className="w-fit font-serif text-[1.25rem] leading-none tracking-[-0.045em] text-ink md:text-[1.42rem]"
          aria-label="Mini Mal1 首页"
        >
          Mini Mal1<span className="text-earth">.</span>
        </Link>

        <nav
          aria-label="主导航"
          className="hidden items-center gap-7 lg:flex lg:gap-9"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[11px] font-medium tracking-[0.07em] text-muted transition-colors hover:text-ink focus-visible:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-1 sm:gap-1.5">
          <button
            type="button"
            aria-label="搜索商品"
            className="grid size-9 place-items-center text-ink transition-colors hover:text-earth sm:size-10"
          >
            <SearchIcon className="size-[18px]" />
          </button>
          {sessionPending ? (
            <span
              aria-hidden="true"
              className="hidden h-5 w-14 animate-pulse bg-rule/45 lg:block motion-reduce:animate-none"
            />
          ) : user ? (
            <div className="hidden items-center gap-3 lg:flex">
              <Link
                href="/account"
                aria-label="查看我的账户"
                className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium text-ink transition-colors hover:text-earth"
              >
                <UserIcon className="size-[18px]" />
                <span className="max-w-20 truncate">
                  {user.name ?? "我的账户"}
                </span>
                {user.role === "ADMIN" && (
                  <span className="border border-earth/35 px-1.5 py-0.5 text-[8px] tracking-[0.08em] text-earth">
                    管理员
                  </span>
                )}
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="text-[10px] text-muted transition-colors hover:text-ink"
                >
                  退出
                </button>
              </form>
            </div>
          ) : (
            <div className="hidden items-center gap-2 text-[10px] font-medium tracking-[0.05em] text-ink lg:flex">
              <Link
                href="/login"
                className="transition-colors hover:text-earth"
              >
                登录
              </Link>
              <span aria-hidden="true" className="text-rule">
                /
              </span>
              <Link
                href="/register"
                className="transition-colors hover:text-earth"
              >
                注册
              </Link>
            </div>
          )}
          <Link
            href="/cart"
            aria-label={getCartAriaLabel(cartQuantity)}
            className="relative grid size-9 place-items-center text-ink transition-colors hover:text-earth sm:size-10"
          >
            <BagIcon className="size-[18px]" />
            {cartBadge && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-earth px-1 text-[9px] leading-none font-semibold tabular-nums text-paper"
              >
                {cartBadge}
              </span>
            )}
          </Link>
          <button
            ref={menuButtonRef}
            type="button"
            aria-label="打开移动导航"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen(true)}
            className="grid size-9 place-items-center text-ink sm:size-10 lg:hidden"
          >
            <MenuIcon className="size-[22px]" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id="mobile-navigation"
          role="dialog"
          aria-modal="true"
          aria-label="移动导航"
          className="fixed inset-0 z-[60] flex min-h-dvh flex-col overscroll-contain bg-canvas px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-ink lg:hidden"
        >
          <div className="flex h-12 items-center justify-between">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="font-serif text-[1.35rem] tracking-[-0.045em]"
            >
              Mini Mal1<span className="text-earth">.</span>
            </Link>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="关闭移动导航"
              onClick={() => setMenuOpen(false)}
              className="grid size-11 place-items-center"
            >
              <CloseIcon className="size-6" />
            </button>
          </div>

          <nav
            aria-label="移动端主导航"
            className="mt-14 flex flex-col border-t border-rule"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
              className="border-b border-rule py-5 font-serif text-[1.8rem] tracking-[-0.035em] transition-colors hover:text-earth active:text-earth"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto flex items-center gap-6 border-t border-rule pt-6 text-sm text-muted">
            <button type="button" className="inline-flex items-center gap-2">
              <SearchIcon className="size-[18px]" />
              搜索
            </button>
            {sessionPending ? (
              <span className="inline-flex items-center gap-2">
                <UserIcon className="size-[18px]" />
                账户
              </span>
            ) : user ? (
              <>
                <Link
                  href="/account"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex min-w-0 items-center gap-2 transition-colors hover:text-ink"
                >
                  <UserIcon className="size-[18px]" />
                  <span className="max-w-24 truncate">
                    {user.name ?? "我的账户"}
                  </span>
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="transition-colors hover:text-ink"
                  >
                    退出
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center gap-2 transition-colors hover:text-ink"
                >
                  <UserIcon className="size-[18px]" />
                  登录
                </Link>
                <Link
                  href="/register"
                  onClick={() => setMenuOpen(false)}
                  className="transition-colors hover:text-ink"
                >
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

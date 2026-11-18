"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

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
import {
  buildHeaderSearchHref,
  normalizeHeaderSearchQuery,
} from "@/lib/header-search";

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
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPending, startSearchTransition] = useTransition();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (!searchOpen) return;

    const previousOverflow = document.body.style.overflow;
    const searchButton = searchButtonRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSearchOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    searchInputRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      searchButton?.focus();
    };
  }, [searchOpen]);

  function openSearch() {
    setMenuOpen(false);
    setSearchOpen(true);
  }

  function closeSearch() {
    setSearchOpen(false);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = normalizeHeaderSearchQuery(searchQuery);
    setSearchQuery(query);
    setSearchOpen(false);

    startSearchTransition(() => {
      router.push(buildHeaderSearchHref(query));
    });
  }

  function clearSearch() {
    setSearchQuery("");
    setSearchOpen(false);

    startSearchTransition(() => {
      router.push(buildHeaderSearchHref(""));
    });
  }

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
            ref={searchButtonRef}
            type="button"
            aria-label="搜索商品"
            aria-expanded={searchOpen}
            aria-controls="header-search"
            onClick={openSearch}
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

      {searchOpen && (
        <div
          id="header-search"
          role="dialog"
          aria-modal="true"
          aria-label="搜索商品"
          className="fixed inset-0 z-[65] bg-ink/22 pt-16 backdrop-blur-[2px] md:pt-[72px]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSearch();
          }}
        >
          <div className="border-b border-rule bg-canvas px-5 py-5 shadow-[0_18px_50px_rgba(32,27,23,0.08)] sm:px-8 lg:px-12 xl:px-16">
            <form
              role="search"
              onSubmit={submitSearch}
              className="mx-auto flex w-full max-w-[1440px] items-end gap-4"
            >
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="header-search-input"
                  className="mb-2 block text-[10px] font-medium tracking-[0.16em] text-muted uppercase"
                >
                  搜索商品
                </label>
                <div className="flex items-center border-b border-ink pb-3 focus-within:border-earth">
                  <SearchIcon className="mr-3 size-5 shrink-0 text-muted" />
                  <input
                    ref={searchInputRef}
                    id="header-search-input"
                    name="search"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="输入商品名称，按回车搜索"
                    autoComplete="off"
                    maxLength={80}
                    className="min-w-0 flex-1 bg-transparent text-lg text-ink outline-none placeholder:text-muted/55 sm:text-2xl"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      disabled={searchPending}
                      className="ml-3 min-h-9 border-b border-transparent px-1 text-[10px] font-medium tracking-[0.08em] text-muted transition-colors hover:border-ink hover:text-ink disabled:cursor-wait"
                    >
                      清空并查看全部
                    </button>
                  )}
                </div>
              </div>
              <button
                type="submit"
                disabled={searchPending}
                className="min-h-11 bg-ink px-5 text-[10px] font-medium tracking-[0.12em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-wait disabled:bg-muted"
              >
                {searchPending ? "搜索中…" : "搜索"}
              </button>
              <button
                type="button"
                aria-label="关闭搜索"
                onClick={closeSearch}
                className="grid size-11 shrink-0 place-items-center text-ink transition-colors hover:text-earth"
              >
                <CloseIcon className="size-5" />
              </button>
            </form>
            <p className="mx-auto mt-3 w-full max-w-[1440px] text-[10px] text-muted">
              搜索后可在商品列表继续按分类、价格排序和页码浏览。
            </p>
          </div>
        </div>
      )}

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
            <button
              type="button"
              onClick={openSearch}
              className="inline-flex items-center gap-2"
            >
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

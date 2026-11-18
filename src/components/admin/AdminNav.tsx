"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    href: "/admin",
    label: "概览",
    hint: "运营数据",
    exact: true,
  },
  {
    href: "/admin/products",
    label: "商品",
    hint: "库存与上下架",
  },
  {
    href: "/admin/categories",
    label: "分类",
    hint: "目录结构",
  },
  {
    href: "/admin/orders",
    label: "订单",
    hint: "履约与支付",
  },
] as const;

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="后台导航">
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
        {navigation.map((item) => {
          const active =
            "exact" in item
              ? pathname === item.href
              : pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href} className="shrink-0 lg:w-full">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group flex min-h-12 items-center justify-between gap-5 border px-4 py-3 transition-colors ${
                  active
                    ? "border-[#c6a98c] bg-[#f4ede4] text-ink"
                    : "border-white/12 text-white/72 hover:border-white/30 hover:text-white"
                }`}
              >
                <span>
                  <span className="block text-[12px] font-medium tracking-[0.08em]">
                    {item.label}
                  </span>
                  <span
                    className={`mt-0.5 hidden text-[9px] tracking-[0.08em] lg:block ${
                      active ? "text-earth" : "text-white/36"
                    }`}
                  >
                    {item.hint}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className={`text-sm transition-transform group-hover:translate-x-0.5 ${
                    active ? "text-earth" : "text-white/28"
                  }`}
                >
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

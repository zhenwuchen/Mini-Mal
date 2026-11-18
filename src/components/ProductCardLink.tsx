"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { markProductDetailScrollIntent } from "@/lib/product-detail-scroll";

export function ProductCardLink({
  href,
  ariaLabel,
  className,
  scrollToTopOnNavigate = false,
  children,
}: {
  href: string;
  ariaLabel?: string;
  className?: string;
  scrollToTopOnNavigate?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={className}
      onNavigate={
        scrollToTopOnNavigate
          ? () => markProductDetailScrollIntent()
          : undefined
      }
    >
      {children}
    </Link>
  );
}

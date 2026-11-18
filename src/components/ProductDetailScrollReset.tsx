"use client";

import { useEffect } from "react";

import { consumeProductDetailScrollIntent } from "@/lib/product-detail-scroll";

function scrollToTopInstantly() {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;

  root.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previousScrollBehavior;
}

export function ProductDetailScrollReset({ slug }: { slug: string }) {
  useEffect(() => {
    if (!consumeProductDetailScrollIntent()) return;

    scrollToTopInstantly();
    const frame = window.requestAnimationFrame(scrollToTopInstantly);

    return () => window.cancelAnimationFrame(frame);
  }, [slug]);

  return null;
}

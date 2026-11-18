import type { Metadata } from "next";
import Link from "next/link";

import { AddressForm } from "@/components/address/AddressForm";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";
import { requireUser } from "@/lib/auth-session";

export const instant = false;

export const metadata: Metadata = {
  title: "新增收货地址 | Mini Mal1",
  robots: { index: false, follow: false },
};

export default async function NewAddressPage() {
  await requireUser("/account/addresses/new");

  return (
    <>
      <SkipLink />
      <Header />
      <main
        id="main-content"
        className="mx-auto w-full max-w-[980px] px-5 py-12 sm:px-8 sm:py-16 lg:px-12"
      >
        <Link
          href="/account/addresses"
          className="text-[10px] font-medium tracking-[0.12em] text-muted uppercase transition-colors hover:text-ink"
        >
          返回地址列表
        </Link>
        <p className="mt-10 text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
          New destination
        </p>
        <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em] sm:text-6xl">
          新增收货地址
        </h1>
        <p className="mt-5 max-w-[560px] text-sm leading-7 text-muted">
          地址只属于当前登录账户。第一条地址会自动设为默认地址。
        </p>
        <div className="mt-10 border-t border-rule/80 pt-8">
          <AddressForm mode="create" />
        </div>
      </main>
      <Footer />
    </>
  );
}

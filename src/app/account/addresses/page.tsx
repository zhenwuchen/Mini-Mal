import type { Metadata } from "next";
import Link from "next/link";

import { AddressActions } from "@/components/address/AddressActions";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";
import { getAddresses } from "@/lib/address";
import { requireUser } from "@/lib/auth-session";

export const instant = false;

export const metadata: Metadata = {
  title: "收货地址 | Mini Mal1",
  robots: { index: false, follow: false },
};

export default async function AddressesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireUser("/account/addresses");
  const [addresses, query] = await Promise.all([
    getAddresses(),
    searchParams,
  ]);

  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content">
        <section className="border-b border-rule/70">
          <div className="mx-auto w-full max-w-[1440px] px-5 pt-10 pb-12 sm:px-8 sm:pt-14 sm:pb-16 lg:px-12 xl:px-16">
            <nav
              aria-label="面包屑"
              className="mb-10 flex flex-wrap items-center gap-3 text-[10px] tracking-[0.12em] text-muted uppercase"
            >
              <Link href="/" className="hover:text-ink">首页</Link>
              <span aria-hidden="true">/</span>
              <Link href="/account" className="hover:text-ink">我的账户</Link>
              <span aria-hidden="true">/</span>
              <span className="text-ink">收货地址</span>
            </nav>

            <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
                  Delivery details
                </p>
                <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em] sm:text-7xl">
                  收货地址
                </h1>
              </div>
              <Link
                href="/account/addresses/new"
                className="inline-flex min-h-12 items-center justify-center bg-ink px-7 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
              >
                新增地址
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 xl:px-16">
          {query.saved === "1" && (
            <p
              role="status"
              className="mb-8 border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm text-ink"
            >
              收货地址已保存。
            </p>
          )}

          {addresses.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2">
              {addresses.map((address) => (
                <article
                  key={address.id}
                  className={`border p-6 sm:p-8 ${
                    address.isDefault
                      ? "border-ink bg-paper"
                      : "border-rule bg-paper/55"
                  }`}
                >
                  <div className="flex items-start justify-between gap-5">
                    <div>
                      <p className="font-serif text-2xl tracking-[-0.03em]">
                        {address.recipientName}
                      </p>
                      <p className="mt-2 text-xs tabular-nums text-muted">
                        {address.phone}
                      </p>
                    </div>
                    {address.isDefault && (
                      <span className="border border-earth/35 bg-earth/8 px-2.5 py-1 text-[9px] font-medium tracking-[0.1em] text-earth">
                        默认地址
                      </span>
                    )}
                  </div>

                  <address className="mt-6 not-italic text-sm leading-7 text-muted">
                    {address.province} {address.city} {address.district}
                    <br />
                    {address.addressLine}
                    {address.postalCode && (
                      <>
                        <br />
                        邮编 {address.postalCode}
                      </>
                    )}
                  </address>

                  <div className="mt-6 flex items-center gap-5">
                    <Link
                      href={`/account/addresses/${encodeURIComponent(address.id)}/edit`}
                      className="min-h-9 border-b border-ink pb-0.5 text-[10px] font-medium tracking-[0.1em] uppercase transition-colors hover:border-earth hover:text-earth"
                    >
                      编辑
                    </Link>
                  </div>

                  <AddressActions
                    addressId={address.id}
                    isDefault={address.isDefault}
                  />
                </article>
              ))}
            </div>
          ) : (
            <div className="border-y border-rule/80 py-20 text-center">
              <p className="font-serif text-4xl tracking-[-0.04em]">
                还没有收货地址。
              </p>
              <p className="mx-auto mt-4 max-w-[420px] text-sm leading-7 text-muted">
                添加第一条地址后即可进入结算，它会自动成为默认地址。
              </p>
              <Link
                href="/account/addresses/new"
                className="mt-8 inline-flex min-h-12 items-center bg-ink px-7 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
              >
                添加收货地址
              </Link>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

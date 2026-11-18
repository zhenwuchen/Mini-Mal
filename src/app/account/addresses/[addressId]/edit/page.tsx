import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AddressForm } from "@/components/address/AddressForm";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";
import { getAddress, AddressError } from "@/lib/address";
import type { AddressSummary } from "@/lib/address-service";
import { requireUser } from "@/lib/auth-session";

export const instant = false;

export const metadata: Metadata = {
  title: "编辑收货地址 | Mini Mal1",
  robots: { index: false, follow: false },
};

export default async function EditAddressPage({
  params,
}: {
  params: Promise<{ addressId: string }>;
}) {
  const { addressId } = await params;
  await requireUser(
    `/account/addresses/${encodeURIComponent(addressId)}/edit`,
  );

  let address: AddressSummary;

  try {
    address = await getAddress(addressId);
  } catch (error) {
    if (error instanceof AddressError && error.code === "ADDRESS_NOT_FOUND") {
      notFound();
    }

    throw error;
  }

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
          Edit destination
        </p>
        <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em] sm:text-6xl">
          编辑收货地址
        </h1>
        <div className="mt-10 border-t border-rule/80 pt-8">
          <AddressForm mode="edit" address={address} />
        </div>
      </main>
      <Footer />
    </>
  );
}

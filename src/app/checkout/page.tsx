import type { Metadata } from "next";
import Link from "next/link";
import { randomUUID } from "node:crypto";

import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";
import { getAddresses } from "@/lib/address";
import { requireUser } from "@/lib/auth-session";
import { getCart } from "@/lib/cart";
import { getCartItemImage } from "@/lib/cart-page";

export const instant = false;

export const metadata: Metadata = {
  title: "确认订单 | Mini Mal1",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage() {
  await requireUser("/checkout");
  const [cart, addresses] = await Promise.all([
    getCart(),
    getAddresses(),
  ]);
  const checkoutKey = randomUUID();
  const ready =
    cart.items.length > 0 &&
    cart.items.every(
      (item) =>
        item.isActive &&
        item.stock > 0 &&
        item.quantity <= item.stock,
    );

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
              <Link href="/cart" className="hover:text-ink">购物袋</Link>
              <span aria-hidden="true">/</span>
              <span className="text-ink">确认订单</span>
            </nav>
            <div className="grid gap-7 lg:grid-cols-[1fr_360px] lg:items-end">
              <div>
                <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
                  Checkout
                </p>
                <h1 className="mt-4 font-serif text-5xl tracking-[-0.05em] sm:text-7xl">
                  确认订单
                </h1>
              </div>
              <p className="text-sm leading-7 text-muted lg:justify-self-end">
                确认收货地址与商品后，服务端会在同一事务中校验库存、计算金额、
                创建订单并移出购物车。
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 xl:px-16">
          {cart.items.length > 0 ? (
            <CheckoutForm
              addresses={addresses.map((address) => ({
                id: address.id,
                recipientName: address.recipientName,
                phone: address.phone,
                province: address.province,
                city: address.city,
                district: address.district,
                addressLine: address.addressLine,
                postalCode: address.postalCode,
                isDefault: address.isDefault,
              }))}
              checkoutKey={checkoutKey}
              items={cart.items.map((item) => ({
                id: item.id,
                name: item.name,
                slug: item.slug,
                imageUrl: getCartItemImage(item.imageUrl),
                price: item.price,
                quantity: item.quantity,
                subtotal: item.subtotal,
              }))}
              totalAmount={cart.totalAmount}
              ready={ready}
            />
          ) : (
            <div className="border-y border-rule/80 py-20 text-center">
              <p className="font-serif text-4xl tracking-[-0.04em]">
                购物袋里还没有商品。
              </p>
              <Link
                href="/products"
                className="mt-8 inline-flex min-h-12 items-center bg-ink px-7 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
              >
                返回商品列表
              </Link>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

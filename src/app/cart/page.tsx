import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { BagIcon } from "@/components/Icons";
import { SkipLink } from "@/components/SkipLink";
import { CartItemControls } from "@/components/cart/CartItemControls";
import { CatalogImage } from "@/components/CatalogImage";
import { formatPrice } from "@/lib/catalog";
import { getCart, type CartItemSummary } from "@/lib/cart";
import {
  getCartItemAvailability,
  getCartItemImage,
} from "@/lib/cart-page";
import { requireUser } from "@/lib/auth-session";

export const instant = false;

export const metadata: Metadata = {
  title: "购物袋 | Mini Mal1",
  description: "查看并整理你的 Mini Mal1 购物袋。",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CartPage() {
  await requireUser("/cart");
  const cart = await getCart();

  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content">
        <section className="border-b border-rule/70">
          <div className="mx-auto w-full max-w-[1440px] px-5 pt-10 pb-12 sm:px-8 sm:pt-14 sm:pb-16 lg:px-12 lg:pt-16 lg:pb-18 xl:px-16">
            <nav
              aria-label="面包屑"
              className="mb-10 flex items-center gap-3 text-[10px] tracking-[0.12em] text-muted uppercase"
            >
              <Link href="/" className="transition-colors hover:text-ink">
                首页
              </Link>
              <span aria-hidden="true">/</span>
              <span className="text-ink">购物袋</span>
            </nav>

            <div className="grid gap-7 lg:grid-cols-[1fr_380px] lg:items-end">
              <div>
                <p className="mb-4 text-[10px] font-medium tracking-[0.22em] text-earth uppercase">
                  Your selection
                </p>
                <h1 className="font-serif text-[3.15rem] leading-[0.98] tracking-[-0.055em] text-balance sm:text-6xl lg:text-7xl">
                  购物袋
                </h1>
              </div>
              <p className="max-w-[380px] text-[13px] leading-6 text-muted sm:text-sm sm:leading-7 lg:justify-self-end">
                {cart.items.length > 0
                  ? `已选 ${cart.totalQuantity} 件商品。价格与库存将在每次更新时重新确认。`
                  : "从经得起日常使用的好物中，挑选真正适合你的那一件。"}
              </p>
            </div>
          </div>
        </section>

        {cart.items.length > 0 ? (
          <CartContent
            items={cart.items}
            totalQuantity={cart.totalQuantity}
            totalAmount={cart.totalAmount}
          />
        ) : (
          <EmptyCart />
        )}
      </main>
      <Footer />
    </>
  );
}

function CartContent({
  items,
  totalQuantity,
  totalAmount,
}: {
  items: CartItemSummary[];
  totalQuantity: number;
  totalAmount: number;
}) {
  return (
    <section className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16 xl:px-16">
      <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14 xl:gap-20">
        <div className="min-w-0">
          <div className="flex items-end justify-between gap-6 border-b border-rule/80 pb-4">
            <h2 className="font-serif text-3xl tracking-[-0.04em] sm:text-4xl">
              已选商品
            </h2>
            <p className="text-[11px] tabular-nums text-muted">
              {totalQuantity} 件
            </p>
          </div>

          <ul aria-label="购物车商品">
            {items.map((item, index) => (
              <CartLineItem
                key={item.id}
                item={item}
                preloadImage={index === 0}
              />
            ))}
          </ul>
        </div>

        <aside
          aria-label="订单摘要"
          className="border border-rule/85 bg-paper p-6 sm:p-8 lg:sticky lg:top-[104px]"
        >
          <div className="border-l-2 border-earth pl-4">
            <p className="text-[10px] font-medium tracking-[0.18em] text-earth uppercase">
              Order summary
            </p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">
              订单摘要
            </h2>
          </div>

          <dl className="mt-8 border-t border-rule/80 text-sm">
            <div className="flex items-center justify-between gap-6 border-b border-rule/70 py-4">
              <dt className="text-muted">商品总数量</dt>
              <dd className="tabular-nums text-ink">
                {totalQuantity} 件
              </dd>
            </div>
            <div className="flex items-center justify-between gap-6 border-b border-rule/70 py-4">
              <dt className="text-muted">商品金额</dt>
              <dd className="tabular-nums text-ink">
                {formatPrice(totalAmount)}
              </dd>
            </div>
          </dl>

          <div className="mt-5 flex items-end justify-between gap-5">
            <span className="text-sm text-muted">合计</span>
            <strong className="text-xl font-medium tabular-nums text-ink">
              {formatPrice(totalAmount)}
            </strong>
          </div>

          <Link
            href="/checkout"
            className="mt-7 flex min-h-13 w-full items-center justify-center bg-ink px-5 py-4 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth"
          >
            前往结算
          </Link>
          <p className="mt-4 text-[11px] leading-5 text-muted">
            当前金额仅包含商品价格，不计算优惠券、运费或税费。
          </p>
        </aside>
      </div>

      <div className="mt-12 border-t border-rule/80 pt-6 sm:mt-16">
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center border-b border-ink pb-1 text-[10px] font-medium tracking-[0.14em] text-ink uppercase transition-colors hover:border-earth hover:text-earth"
        >
          继续选购
        </Link>
      </div>
    </section>
  );
}

function CartLineItem({
  item,
  preloadImage,
}: {
  item: CartItemSummary;
  preloadImage: boolean;
}) {
  const availability = getCartItemAvailability(item);
  const image = getCartItemImage(item.imageUrl);
  const availabilityLabel =
    availability === "inactive"
      ? "已下架"
      : availability === "out-of-stock"
        ? "暂时缺货"
        : item.stock < item.quantity
          ? `库存剩余 ${item.stock} 件`
          : item.stock <= 10
            ? `仅剩 ${item.stock} 件`
            : "现货";

  return (
    <li className="grid grid-cols-[104px_minmax(0,1fr)] gap-4 border-b border-rule/80 py-6 sm:grid-cols-[148px_minmax(0,1fr)] sm:gap-6 sm:py-8">
      <Link
        href={`/products/${item.slug}`}
        aria-label={`查看 ${item.name}`}
        className="relative aspect-[4/5] overflow-hidden bg-[#e9e3db]"
      >
        <CatalogImage
          src={image}
          alt={item.name}
          sizes="(max-width: 640px) 104px, 148px"
          className="object-cover"
          preload={preloadImage}
        />
      </Link>

      <div className="flex min-w-0 flex-col">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="line-clamp-2 break-words font-serif text-xl leading-[1.2] tracking-[-0.03em] text-ink sm:text-2xl">
              <Link
                href={`/products/${item.slug}`}
                className="transition-colors hover:text-earth"
              >
                {item.name}
              </Link>
            </h3>
            <p
              className={`mt-2 text-[10px] font-medium tracking-[0.1em] ${
                availability === "available"
                  ? item.stock < item.quantity
                    ? "text-earth"
                    : "text-muted"
                  : "text-earth"
              }`}
            >
              {availabilityLabel}
            </p>
            <p className="mt-2 text-xs tabular-nums text-muted">
              单价 {formatPrice(item.price)}
            </p>
          </div>

          <p className="shrink-0 text-right text-xs text-muted">
            小计
            <strong className="mt-1 block text-sm font-medium tabular-nums text-ink sm:text-[15px]">
              {formatPrice(item.subtotal)}
            </strong>
          </p>
        </div>

        <div className="mt-auto pt-5">
          <CartItemControls
            cartItemId={item.id}
            productName={item.name}
            quantity={item.quantity}
            stock={item.stock}
            isActive={item.isActive}
          />
        </div>
      </div>
    </li>
  );
}

function EmptyCart() {
  return (
    <section className="mx-auto w-full max-w-[1440px] px-5 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20 xl:px-16">
      <div className="grid items-center gap-10 border-y border-rule/80 py-16 sm:grid-cols-[minmax(0,1fr)_auto] sm:py-20 lg:py-24">
        <div>
          <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
            Nothing selected
          </p>
          <h2 className="mt-4 max-w-[620px] font-serif text-4xl leading-[1.03] tracking-[-0.05em] text-balance sm:text-5xl">
            购物袋里还没有商品。
          </h2>
          <p className="mt-5 max-w-[460px] text-sm leading-7 text-muted">
            浏览精选商品，把真正喜欢的设计带进日常。
          </p>
          <Link
            href="/products"
            className="mt-8 inline-flex min-h-12 items-center bg-ink px-7 py-3.5 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth"
          >
            继续购物
          </Link>
        </div>
        <div
          aria-hidden="true"
          className="hidden justify-self-end pr-6 text-rule sm:block lg:pr-12"
        >
          <BagIcon className="size-36 stroke-[0.7] lg:size-48" />
        </div>
      </div>
    </section>
  );
}

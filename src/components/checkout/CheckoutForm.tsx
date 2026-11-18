"use client";

import Link from "next/link";
import { useActionState } from "react";

import { checkoutAction } from "@/app/actions/checkout";
import { CatalogImage } from "@/components/CatalogImage";
import {
  initialCheckoutActionState,
  type CheckoutActionState,
} from "@/lib/checkout-action";
import { formatPrice } from "@/lib/catalog";

type CheckoutAddress = {
  id: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
};

type CheckoutItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string;
  price: number;
  quantity: number;
  subtotal: number;
};

export function CheckoutForm({
  addresses,
  checkoutKey,
  items,
  totalAmount,
  ready,
}: {
  addresses: CheckoutAddress[];
  checkoutKey: string;
  items: CheckoutItem[];
  totalAmount: number;
  ready: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    CheckoutActionState,
    FormData
  >(checkoutAction, initialCheckoutActionState);
  const defaultAddressId =
    addresses.find((address) => address.isDefault)?.id ?? addresses[0]?.id;

  return (
    <form action={formAction} className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:gap-20">
      <input type="hidden" name="checkoutKey" value={checkoutKey} />

      <div className="min-w-0">
        <section aria-labelledby="checkout-address-title">
          <div className="flex items-end justify-between gap-5 border-b border-rule/80 pb-4">
            <div>
              <p className="text-[10px] font-medium tracking-[0.16em] text-earth uppercase">
                01 / 收货地址
              </p>
              <h2
                id="checkout-address-title"
                className="mt-2 font-serif text-3xl tracking-[-0.04em]"
              >
                送到哪里
              </h2>
            </div>
            <Link
              href="/account/addresses"
              className="border-b border-ink pb-1 text-[10px] font-medium tracking-[0.1em] uppercase transition-colors hover:border-earth hover:text-earth"
            >
              管理地址
            </Link>
          </div>

          {addresses.length > 0 ? (
            <div className="mt-6 grid gap-3">
              {addresses.map((address) => (
                <label
                  key={address.id}
                  className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-4 border border-rule bg-paper p-5 transition-colors hover:border-ink/45 has-[:checked]:border-ink has-[:checked]:bg-paper"
                >
                  <input
                    type="radio"
                    name="addressId"
                    value={address.id}
                    defaultChecked={address.id === defaultAddressId}
                    className="mt-1 size-4 shrink-0 accent-earth"
                  />
                  <span>
                    <span className="flex flex-wrap items-center gap-3">
                      <strong className="font-medium text-ink">
                        {address.recipientName}
                      </strong>
                      <span className="text-xs tabular-nums text-muted">
                        {address.phone}
                      </span>
                      {address.isDefault && (
                        <span className="text-[9px] tracking-[0.1em] text-earth">
                          默认
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block text-sm leading-6 text-muted">
                      {address.province} {address.city} {address.district}
                      <br />
                      {address.addressLine}
                      {address.postalCode ? ` · ${address.postalCode}` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-6 border-y border-rule/80 py-10">
              <p className="font-serif text-3xl tracking-[-0.04em]">
                先添加一条收货地址。
              </p>
              <Link
                href="/account/addresses/new"
                className="mt-6 inline-flex min-h-11 items-center bg-ink px-6 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
              >
                新增地址
              </Link>
            </div>
          )}
        </section>

        <section aria-labelledby="checkout-items-title" className="mt-12">
          <div className="border-b border-rule/80 pb-4">
            <p className="text-[10px] font-medium tracking-[0.16em] text-earth uppercase">
              02 / 商品确认
            </p>
            <h2
              id="checkout-items-title"
              className="mt-2 font-serif text-3xl tracking-[-0.04em]"
            >
              本次订单
            </h2>
          </div>

          <ul aria-label="结算商品">
            {items.map((item) => (
              <li
                key={item.id}
                className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule/80 py-5"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-[#e9e3db]">
                  <CatalogImage
                    src={item.imageUrl}
                    alt={item.name}
                    sizes="76px"
                  />
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 break-words text-sm font-medium">
                    {item.name}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {formatPrice(item.price)} × {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-medium tabular-nums">
                  {formatPrice(item.subtotal)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {state.status === "error" && state.message && (
          <p
            role="alert"
            className="mt-7 border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm leading-6 text-earth"
          >
            {state.message}
          </p>
        )}
      </div>

      <aside className="border border-rule/85 bg-paper p-6 sm:p-8 lg:sticky lg:top-[104px]">
        <p className="text-[10px] font-medium tracking-[0.18em] text-earth uppercase">
          Order review
        </p>
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">
          订单确认
        </h2>

        <dl className="mt-8 border-t border-rule/80 text-sm">
          <div className="flex items-center justify-between gap-6 border-b border-rule/70 py-4">
            <dt className="text-muted">商品金额</dt>
            <dd className="tabular-nums text-ink">
              {formatPrice(totalAmount)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-6 border-b border-rule/70 py-4">
            <dt className="text-muted">运费</dt>
            <dd className="text-ink">免运费</dd>
          </div>
        </dl>

        <div className="mt-5 flex items-end justify-between gap-5">
          <span className="text-sm text-muted">应付金额</span>
          <strong className="text-xl font-medium tabular-nums text-ink">
            {formatPrice(totalAmount)}
          </strong>
        </div>

        <p className="mt-5 text-[11px] leading-5 text-muted">
          页面金额用于确认。提交时由服务端重新读取商品价格、库存和地址，
          最终订单金额以服务端计算结果为准。
        </p>

        {!ready && (
          <p className="mt-4 border-l-2 border-earth pl-3 text-xs leading-5 text-earth">
            购物车中存在下架、缺货或库存不足的商品，请先返回购物车调整。
          </p>
        )}

        <button
          type="submit"
          disabled={
            pending ||
            !ready ||
            addresses.length === 0
          }
          className="mt-7 min-h-13 w-full bg-ink px-5 py-4 text-[10px] font-medium tracking-[0.16em] text-white uppercase transition-colors hover:bg-earth disabled:cursor-not-allowed disabled:bg-muted/50"
        >
          {pending ? "正在创建订单…" : "提交订单"}
        </button>

        <Link
          href="/cart"
          className="mt-5 inline-flex min-h-10 items-center border-b border-ink pb-0.5 text-[10px] font-medium tracking-[0.1em] uppercase transition-colors hover:border-earth hover:text-earth"
        >
          返回购物袋
        </Link>
      </aside>
    </form>
  );
}

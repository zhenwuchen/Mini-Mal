import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CatalogImage } from "@/components/CatalogImage";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ArrowRightIcon } from "@/components/Icons";
import { OrderPaymentPanel } from "@/components/orders/OrderPaymentPanel";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { SkipLink } from "@/components/SkipLink";
import { requireUser } from "@/lib/auth-session";
import { formatPrice } from "@/lib/catalog";
import { getOrderItemImage } from "@/lib/order-query-core";
import {
  getOrderDetail,
  OrderQueryError,
  type OrderDetail,
} from "@/lib/order-query";

export const instant = false;

export const metadata: Metadata = {
  title: "订单详情 | Mini Mal1",
  description: "查看 Mini Mal1 历史订单快照。",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: PageProps<"/account/orders/[orderNumber]">) {
  const { orderNumber } = await params;
  await requireUser(
    `/account/orders/${encodeURIComponent(orderNumber)}`,
  );
  const query = await searchParams;

  let order: OrderDetail;

  try {
    order = await getOrderDetail(orderNumber);
  } catch (error) {
    if (
      error instanceof OrderQueryError &&
      error.code === "ORDER_NOT_FOUND"
    ) {
      notFound();
    }

    if (error instanceof OrderQueryError) {
      return (
        <>
          <SkipLink />
          <Header />
          <main id="main-content">
            <DetailErrorState />
          </main>
          <Footer />
        </>
      );
    }

    throw error;
  }

  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content">
        {query.created === "1" && (
          <p
            role="status"
            className="mx-auto mt-6 w-[calc(100%-2.5rem)] max-w-[1344px] border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm text-ink sm:w-[calc(100%-4rem)]"
          >
            订单已创建。请核对支付截止时间后完成支付。
          </p>
        )}
        {query.cancelled === "1" && (
          <p
            role="status"
            className="mx-auto mt-6 w-[calc(100%-2.5rem)] max-w-[1344px] border-l-2 border-earth bg-earth/6 px-4 py-3 text-sm text-ink sm:w-[calc(100%-4rem)]"
          >
            订单已取消。库存恢复由取消事务完成，页面不会重复执行库存操作。
          </p>
        )}
        <section className="border-b border-rule/70">
          <div className="mx-auto w-full max-w-[1440px] px-5 pt-8 pb-10 sm:px-8 sm:pt-10 sm:pb-12 lg:px-12 lg:pt-12 xl:px-16">
            <nav
              aria-label="面包屑"
              className="flex flex-wrap items-center gap-3 text-[10px] tracking-[0.1em] text-muted uppercase"
            >
              <Link href="/" className="transition-colors hover:text-ink">
                首页
              </Link>
              <span aria-hidden="true">/</span>
              <Link
                href="/account"
                className="transition-colors hover:text-ink"
              >
                我的账户
              </Link>
              <span aria-hidden="true">/</span>
              <Link
                href="/account/orders"
                className="transition-colors hover:text-ink"
              >
                我的订单
              </Link>
              <span aria-hidden="true">/</span>
              <span className="max-w-[220px] truncate text-ink">
                订单详情
              </span>
            </nav>

            <div className="mt-9 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
              <div className="min-w-0">
                <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
                  Order detail
                </p>
                <h1 className="mt-4 font-serif text-[2.65rem] leading-[1.02] tracking-[-0.05em] sm:text-5xl lg:text-6xl">
                  订单详情
                </h1>
                <p className="mt-5 break-all text-xs leading-6 tracking-[0.035em] text-muted sm:text-[13px]">
                  {order.orderNumber}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 lg:justify-self-end">
                <OrderStatusBadge status={order.status} />
                <div>
                  <p className="text-[9px] tracking-[0.14em] text-muted uppercase">
                    下单时间
                  </p>
                  <time
                    dateTime={order.createdAt.toISOString()}
                    className="mt-1 block text-xs text-ink"
                  >
                    {formatOrderDate(order.createdAt)}
                  </time>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16 xl:px-16">
          <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14 xl:gap-20">
            <div className="min-w-0">
              <div className="flex items-end justify-between gap-6 border-b border-rule/80 pb-4">
                <h2 className="font-serif text-3xl tracking-[-0.04em] sm:text-4xl">
                  商品清单
                </h2>
                <p className="text-[11px] tabular-nums text-muted">
                  {order.items.reduce(
                    (total, item) => total + item.quantity,
                    0,
                  )}{" "}
                  件
                </p>
              </div>

              {order.items.length > 0 ? (
                <ul aria-label="订单商品清单">
                  {order.items.map((item, index) => (
                    <li
                      key={`${item.productName}-${item.productSlug ?? "snapshot"}-${index}`}
                      className="grid grid-cols-[80px_minmax(0,1fr)] gap-4 border-b border-rule/80 py-6 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:gap-6 sm:py-8"
                    >
                      <div className="relative aspect-[4/5] overflow-hidden bg-[#e9e3db]">
                        <CatalogImage
                          src={getOrderItemImage(item.productImageUrl)}
                          alt={item.productName}
                          sizes="(max-width: 640px) 80px, 112px"
                          className="object-cover"
                          preload={index === 0}
                        />
                      </div>

                      <div className="min-w-0">
                        <h3 className="break-words font-serif text-xl leading-[1.2] tracking-[-0.03em] text-ink sm:text-2xl">
                          {item.productName}
                        </h3>
                        <p className="mt-3 text-xs tabular-nums text-muted">
                          下单单价 {formatPrice(item.unitPrice)}
                        </p>
                        <p className="mt-1 text-xs tabular-nums text-muted">
                          数量 {item.quantity}
                        </p>
                        <p className="mt-4 text-xs text-muted sm:hidden">
                          小计
                          <strong className="ml-2 text-sm font-medium tabular-nums text-ink">
                            {formatPrice(item.subtotal)}
                          </strong>
                        </p>
                      </div>

                      <div className="hidden min-w-[105px] text-right sm:block">
                        <p className="text-[9px] tracking-[0.14em] text-muted uppercase">
                          小计
                        </p>
                        <p className="mt-2 font-medium tabular-nums text-ink">
                          {formatPrice(item.subtotal)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-b border-rule/80 py-12 text-sm text-muted">
                  该订单暂无商品快照。
                </p>
              )}
            </div>

            <aside className="space-y-8 lg:sticky lg:top-[104px]">
              <OrderPaymentPanel order={order} />
              <OrderAmounts order={order} />
              <ShippingSnapshot order={order} />
            </aside>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-x-7 gap-y-5 border-t border-rule/80 pt-7 sm:mt-16">
            <Link
              href="/account/orders"
              className="inline-flex min-h-11 items-center gap-2 border-b border-ink pb-1 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth"
            >
              <ArrowRightIcon className="size-3.5 rotate-180" />
              返回订单列表
            </Link>
            <Link
              href="/products"
              className="inline-flex min-h-11 items-center bg-ink px-5 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
            >
              返回商品列表
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function OrderAmounts({ order }: { order: OrderDetail }) {
  const totalLabel = ["PAID", "PROCESSING", "SHIPPED", "COMPLETED"].includes(
    order.status,
  )
    ? "实付总金额"
    : order.status === "PENDING_PAYMENT"
      ? "应付总金额"
      : "订单总金额";

  return (
    <section
      aria-label="订单金额"
      className="border border-rule/85 bg-paper p-6 sm:p-8"
    >
      <div className="border-l-2 border-earth pl-4">
        <p className="text-[10px] font-medium tracking-[0.18em] text-earth uppercase">
          Amount summary
        </p>
        <h2 className="mt-2 font-serif text-3xl tracking-[-0.04em]">
          金额明细
        </h2>
      </div>
      <dl className="mt-7 border-t border-rule/80 text-sm">
        <AmountRow
          label="商品总金额"
          amount={order.itemsAmount}
        />
        <AmountRow label="运费" amount={order.shippingAmount} />
        <AmountRow
          label="优惠金额"
          amount={-order.discountAmount}
        />
      </dl>
      <div className="mt-5 flex items-end justify-between gap-5 border-t border-rule pt-5">
        <span className="text-sm text-muted">{totalLabel}</span>
        <strong className="text-xl font-medium tabular-nums text-ink">
          {formatPrice(order.totalAmount)}
        </strong>
      </div>
    </section>
  );
}

function AmountRow({
  label,
  amount,
}: {
  label: string;
  amount: number;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-rule/70 py-4">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums text-ink">{formatPrice(amount)}</dd>
    </div>
  );
}

function ShippingSnapshot({ order }: { order: OrderDetail }) {
  const region = [
    order.shipping.province,
    order.shipping.city,
    order.shipping.district,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      aria-label="收货信息"
      className="border-y border-rule/85 py-7"
    >
      <h2 className="font-serif text-3xl tracking-[-0.04em]">
        收货信息
      </h2>
      <dl className="mt-6 grid gap-5 text-sm">
        <ShippingRow
          label="收件人"
          value={order.shipping.recipientName || "—"}
        />
        <ShippingRow
          label="手机号"
          value={order.shipping.phone || "—"}
        />
        <ShippingRow
          label="省 / 市 / 区"
          value={region || "—"}
        />
        <ShippingRow
          label="详细地址"
          value={order.shipping.addressLine || "—"}
        />
        {order.shipping.postalCode && (
          <ShippingRow
            label="邮编"
            value={order.shipping.postalCode}
          />
        )}
      </dl>
      <p className="mt-6 border-t border-rule/70 pt-5 text-[11px] leading-5 text-muted">
        以上信息来自订单创建时保存的收货地址快照。
      </p>
    </section>
  );
}

function ShippingRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words text-right text-ink">{value}</dd>
    </div>
  );
}

function DetailErrorState() {
  return (
    <section className="mx-auto flex min-h-[62vh] w-full max-w-[1440px] items-center px-5 py-20 sm:px-8 lg:px-12 xl:px-16">
      <div className="max-w-[650px] border-y border-rule/80 py-14 sm:py-20">
        <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
          Unable to load order
        </p>
        <h1 className="mt-5 font-serif text-4xl leading-[1.05] tracking-[-0.045em] sm:text-6xl">
          订单暂时无法加载。
        </h1>
        <p className="mt-6 max-w-[480px] text-sm leading-7 text-muted">
          数据服务刚刚没有响应，请稍后再试。你的订单数据不会受到影响。
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link
            href="/account/orders"
            className="inline-flex min-h-12 items-center bg-ink px-6 py-3.5 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
          >
            返回订单列表
          </Link>
          <Link
            href="/products"
            className="border-b border-ink pb-1 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth"
          >
            返回商品列表
          </Link>
        </div>
      </div>
    </section>
  );
}

function formatOrderDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

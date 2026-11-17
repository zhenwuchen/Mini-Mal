import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import {
  ArrowRightIcon,
  BagIcon,
} from "@/components/Icons";
import { CatalogImage } from "@/components/CatalogImage";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { SkipLink } from "@/components/SkipLink";
import { requireUser } from "@/lib/auth-session";
import { formatPrice } from "@/lib/catalog";
import {
  getOrderItemImage,
  getOrderStatusFilterOptions,
  normalizeOrderListSearchParams,
} from "@/lib/order-query-core";
import {
  getOrders,
  OrderQueryError,
  type OrderListItem,
  type OrderListResult,
} from "@/lib/order-query";

export const instant = false;

export const metadata: Metadata = {
  title: "我的订单 | Mini Mal1",
  description: "查看 Mini Mal1 订单记录与历史商品快照。",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OrdersPage({
  searchParams,
}: PageProps<"/account/orders">) {
  await requireUser("/account/orders");
  const search = normalizeOrderListSearchParams(await searchParams);

  let result: OrderListResult;

  try {
    result = await getOrders({
      page: search.page,
      pageSize: search.pageSize,
      status: search.status,
    });
  } catch (error) {
    if (error instanceof OrderQueryError) {
      return (
        <>
          <SkipLink />
          <Header />
          <main id="main-content">
            <OrdersHero />
            <OrderErrorState />
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
        <OrdersHero />
        <section className="mx-auto w-full max-w-[1440px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12 lg:py-16 xl:px-16">
          <OrderStatusFilters activeStatus={search.status} />

          <div className="mt-8 flex flex-col gap-3 border-b border-rule/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <p role="status" className="text-sm text-ink">
              {result.totalCount > 0
                ? `共 ${result.totalCount} 笔订单`
                : "还没有订单记录"}
            </p>
            {result.totalPages > 0 && (
              <p className="text-[10px] tracking-[0.12em] text-muted">
                第 {result.page} / {result.totalPages} 页
              </p>
            )}
          </div>

          {result.orders.length > 0 ? (
            <div className="mt-2">
              <ul aria-label="我的订单列表">
                {result.orders.map((order, index) => (
                  <OrderListEntry
                    key={order.orderNumber}
                    order={order}
                    preloadImage={index === 0}
                  />
                ))}
              </ul>
              {result.totalPages > 1 && (
                <Pagination
                  currentPage={result.page}
                  totalPages={result.totalPages}
                  status={search.status}
                />
              )}
            </div>
          ) : result.totalCount > 0 ? (
            <PageOutOfRange status={search.status} />
          ) : (
            <EmptyOrders status={search.status} />
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}

function OrdersHero() {
  return (
    <section className="border-b border-rule/70">
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-10 pb-12 sm:px-8 sm:pt-14 sm:pb-16 lg:px-12 lg:pt-16 lg:pb-18 xl:px-16">
        <nav
          aria-label="面包屑"
          className="mb-10 flex flex-wrap items-center gap-3 text-[10px] tracking-[0.12em] text-muted uppercase"
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
          <span className="text-ink">我的订单</span>
        </nav>

        <div className="grid gap-7 lg:grid-cols-[1fr_380px] lg:items-end">
          <div>
            <p className="mb-4 text-[10px] font-medium tracking-[0.22em] text-earth uppercase">
              Order archive
            </p>
            <h1 className="font-serif text-[3.15rem] leading-[0.98] tracking-[-0.055em] text-balance sm:text-6xl lg:text-7xl">
              我的订单
            </h1>
          </div>
          <p className="max-w-[380px] text-[13px] leading-6 text-muted sm:text-sm sm:leading-7 lg:justify-self-end">
            每一笔订单都保留下单时的商品与收货信息，方便你随时回看。
          </p>
        </div>
      </div>
    </section>
  );
}

function OrderStatusFilters({
  activeStatus,
}: {
  activeStatus: string | undefined;
}) {
  const options = getOrderStatusFilterOptions();

  return (
    <nav aria-label="订单状态筛选">
      <ul className="flex flex-wrap gap-x-6 gap-y-3 border-y border-rule/80 py-4">
        {options.map((option) => {
          const active = (option.status || undefined) === activeStatus;
          const href = orderListHref({
            page: 1,
            status: option.status || undefined,
          });

          return (
            <li key={option.status || "all"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-8 items-center border-b text-[11px] font-medium tracking-[0.08em] transition-colors ${
                  active
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:border-rule hover:text-ink"
                }`}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function OrderListEntry({
  order,
  preloadImage,
}: {
  order: OrderListItem;
  preloadImage: boolean;
}) {
  const remainingItemCount = order.itemCount - order.items.length;

  return (
    <li className="border-b border-rule/80 py-6 sm:py-8">
      <article className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_250px] lg:gap-10">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9px] font-medium tracking-[0.16em] text-muted uppercase">
                Order number
              </p>
              <h2 className="mt-1.5 break-all text-xs font-medium tracking-[0.03em] text-ink sm:text-[13px]">
                {order.orderNumber}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-medium tracking-[0.16em] text-muted uppercase">
                Placed on
              </p>
              <time
                dateTime={order.createdAt.toISOString()}
                className="mt-1.5 block text-xs text-muted"
              >
                {formatOrderDate(order.createdAt)}
              </time>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {order.items.map((item, index) => (
              <div
                key={`${item.productName}-${item.productSlug ?? "snapshot"}-${index}`}
                className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-center gap-3"
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-[#e9e3db]">
                  <CatalogImage
                    src={getOrderItemImage(item.productImageUrl)}
                    alt={item.productName}
                    sizes="64px"
                    className="object-cover"
                    preload={preloadImage && index === 0}
                  />
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-2 break-words text-xs font-medium leading-5 text-ink">
                    {item.productName}
                  </p>
                  <p className="mt-1 text-[10px] tabular-nums text-muted">
                    数量 {item.quantity}
                  </p>
                </div>
              </div>
            ))}
            {order.items.length === 0 && (
              <p className="text-xs leading-6 text-muted sm:col-span-3">
                该订单暂无商品快照。
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10px] text-muted">
            <span>共 {order.totalQuantity} 件</span>
            {remainingItemCount > 0 && (
              <span>另有 {remainingItemCount} 种商品</span>
            )}
          </div>
        </div>

        <div className="flex items-end justify-between gap-6 border-t border-rule/70 pt-5 lg:flex-col lg:items-stretch lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
          <div>
            <OrderStatusBadge status={order.status} />
            <p className="mt-5 text-[10px] tracking-[0.1em] text-muted">
              订单总金额
            </p>
            <p className="mt-1.5 text-xl font-medium tabular-nums text-ink">
              {formatPrice(order.totalAmount)}
            </p>
          </div>
          <Link
            href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
            aria-label={`查看订单 ${order.orderNumber} 详情`}
            className="inline-flex min-h-11 items-center gap-2 border-b border-ink pb-1 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth lg:self-end"
          >
            查看详情
            <ArrowRightIcon className="size-3.5" />
          </Link>
        </div>
      </article>
    </li>
  );
}

function Pagination({
  currentPage,
  totalPages,
  status,
}: {
  currentPage: number;
  totalPages: number;
  status: string | undefined;
}) {
  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);

  return (
    <nav
      aria-label="订单分页"
      className="flex items-center justify-between gap-5 py-8"
    >
      {currentPage > 1 ? (
        <Link
          href={orderListHref({ page: previousPage, status })}
          className="inline-flex min-h-11 items-center border border-rule px-5 text-[10px] font-medium tracking-[0.12em] text-ink transition-colors hover:border-ink"
        >
          上一页
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <p className="text-[10px] tabular-nums text-muted">
        {currentPage} / {totalPages}
      </p>
      {currentPage < totalPages ? (
        <Link
          href={orderListHref({ page: nextPage, status })}
          className="inline-flex min-h-11 items-center border border-ink px-5 text-[10px] font-medium tracking-[0.12em] text-ink transition-colors hover:bg-ink hover:text-white"
        >
          下一页
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}

function EmptyOrders({ status }: { status: string | undefined }) {
  const filtered = Boolean(status);

  return (
    <section className="grid items-center gap-10 border-b border-rule/80 py-16 sm:grid-cols-[minmax(0,1fr)_auto] sm:py-20 lg:py-24">
      <div>
        <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
          {filtered ? "No matching orders" : "An empty archive"}
        </p>
        <h2 className="mt-4 max-w-[620px] font-serif text-4xl leading-[1.03] tracking-[-0.05em] text-balance sm:text-5xl">
          {filtered
            ? "这个状态下还没有订单。"
            : "你的订单会在这里安静地出现。"}
        </h2>
        <p className="mt-5 max-w-[470px] text-sm leading-7 text-muted">
          {filtered
            ? "切换到全部订单，或继续浏览精选商品。"
            : "完成结算后，可以随时回来查看商品与收货信息快照。"}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          {filtered && (
            <Link
              href="/account/orders"
              className="inline-flex min-h-11 items-center border border-ink px-5 text-[10px] font-medium tracking-[0.14em] text-ink uppercase transition-colors hover:bg-ink hover:text-white"
            >
              查看全部订单
            </Link>
          )}
          <Link
            href="/products"
            className={`inline-flex min-h-12 items-center px-7 py-3.5 text-[10px] font-medium tracking-[0.16em] uppercase transition-colors ${
              filtered
                ? "border-b border-ink pb-1 text-ink hover:border-earth hover:text-earth"
                : "bg-ink text-white hover:bg-earth"
            }`}
          >
            返回商品列表
          </Link>
        </div>
      </div>
      <div
        aria-hidden="true"
        className="hidden justify-self-end pr-6 text-rule sm:block lg:pr-12"
      >
        <BagIcon className="size-36 stroke-[0.7] lg:size-48" />
      </div>
    </section>
  );
}

function PageOutOfRange({
  status,
}: {
  status: string | undefined;
}) {
  return (
    <section className="border-b border-rule/80 py-16 text-center sm:py-20">
      <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
        Page unavailable
      </p>
      <h2 className="mt-4 font-serif text-4xl tracking-[-0.045em]">
        这一页没有更多订单。
      </h2>
      <p className="mx-auto mt-4 max-w-[430px] text-sm leading-7 text-muted">
        当前页码超出订单记录范围，请返回第一页继续查看。
      </p>
      <Link
        href={orderListHref({ page: 1, status })}
        className="mt-7 inline-flex min-h-11 items-center border border-ink px-5 text-[10px] font-medium tracking-[0.14em] uppercase transition-colors hover:bg-ink hover:text-white"
      >
        返回第一页
      </Link>
    </section>
  );
}

function OrderErrorState() {
  return (
    <section className="mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 xl:px-16">
      <div className="max-w-[620px] border-y border-rule/80 py-14 sm:py-18">
        <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
          Unable to load orders
        </p>
        <h2 className="mt-4 font-serif text-4xl leading-[1.05] tracking-[-0.045em] sm:text-5xl">
          订单暂时无法加载。
        </h2>
        <p className="mt-5 max-w-[470px] text-sm leading-7 text-muted">
          数据服务刚刚没有响应，请稍后再试。你的订单数据不会受到影响。
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <Link
            href="/account/orders"
            className="inline-flex min-h-11 items-center bg-ink px-6 text-[10px] font-medium tracking-[0.14em] text-white uppercase transition-colors hover:bg-earth"
          >
            重新加载
          </Link>
          <Link
            href="/account"
            className="border-b border-ink pb-1 text-[10px] font-medium tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth"
          >
            返回我的账户
          </Link>
        </div>
      </div>
    </section>
  );
}

function orderListHref({
  page,
  status,
}: {
  page: number;
  status?: string;
}) {
  const params = new URLSearchParams();

  if (page > 1) params.set("page", String(page));
  if (status) params.set("status", status);

  const query = params.toString();
  return query ? `/account/orders?${query}` : "/account/orders";
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

import Link from "next/link";

import {
  AdminEmptyState,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { AdminPaymentStatusBadge } from "@/components/admin/AdminPaymentStatusBadge";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { normalizeAdminOrderSearchParams } from "@/lib/admin-order";
import { createAdminOrderService } from "@/lib/admin-order-service";
import { requireAdmin } from "@/lib/auth-session";
import { formatPrice } from "@/lib/catalog";
import { getOrderStatusFilterOptions } from "@/lib/order-query-core";
import { prisma } from "@/lib/prisma";

export const instant = false;

const orderService = createAdminOrderService({ prisma });

const paymentStatusOptions = [
  { value: "UNPAID", label: "未发起支付" },
  { value: "PENDING", label: "支付处理中" },
  { value: "SUCCEEDED", label: "支付成功" },
  { value: "FAILED", label: "支付失败" },
  { value: "CANCELLED", label: "支付已取消" },
  { value: "REFUNDED", label: "已退款" },
] as const;

export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  await requireAdmin("/admin/orders");
  const search = normalizeAdminOrderSearchParams(
    await searchParams,
  );

  const result = await orderService.listOrders(search);
  const orderStatusOptions = getOrderStatusFilterOptions();

  return (
    <div>
        <AdminPageHeader
          eyebrow="Order management"
          title="订单管理"
          description="查询全量订单、商品快照、支付记录和收货地址快照。后台只通过现有取消 Service 处理待付款订单。"
        />

        <form
          action="/admin/orders"
          method="get"
          className="mt-7 grid gap-3 border border-rule bg-paper p-4 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_190px_190px_auto] xl:items-end"
        >
          <FilterField id="admin-order-search" label="搜索订单编号">
            <input
              id="admin-order-search"
              name="q"
              type="search"
              defaultValue={search.q}
              placeholder="输入完整或部分订单编号"
              className={filterInputClass}
            />
          </FilterField>
          <FilterField id="admin-order-status" label="订单状态">
            <select
              id="admin-order-status"
              name="status"
              defaultValue={search.status ?? ""}
              className={filterInputClass}
            >
              {orderStatusOptions.map((option) => (
                <option key={option.status || "all"} value={option.status}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField id="admin-payment-status" label="支付状态">
            <select
              id="admin-payment-status"
              name="paymentStatus"
              defaultValue={search.paymentStatus ?? ""}
              className={filterInputClass}
            >
              <option value="">全部支付状态</option>
              {paymentStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <div className="flex gap-2">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white transition-colors hover:bg-earth"
            >
              筛选
            </button>
            <Link
              href="/admin/orders"
              className="inline-flex min-h-11 items-center px-3 text-[11px] text-muted transition-colors hover:text-ink"
            >
              清除
            </Link>
          </div>
        </form>

        <div className="mt-6 flex flex-col gap-2 border-b border-rule pb-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-xs text-muted">
            共 {result.totalCount} 笔订单
          </p>
          {result.totalPages > 0 && (
            <p className="text-[10px] text-muted">
              第 {result.page} / {result.totalPages} 页
            </p>
          )}
        </div>

        {result.orders.length > 0 ? (
          <>
          <div className="mt-4 hidden overflow-x-auto border border-rule bg-paper md:block">
            <table className="w-full min-w-[1020px] border-collapse text-left">
              <thead>
                <tr className="border-b border-rule bg-[#ece6dd]/75 text-[9px] tracking-[0.1em] text-muted">
                  <th className="px-4 py-3 font-medium">订单编号</th>
                  <th className="px-4 py-3 font-medium">用户</th>
                  <th className="px-4 py-3 font-medium">金额</th>
                  <th className="px-4 py-3 font-medium">订单状态</th>
                  <th className="px-4 py-3 font-medium">支付状态</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                  <th className="px-4 py-3 font-medium">支付时间</th>
                  <th className="px-4 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {result.orders.map((order) => (
                  <tr
                    key={order.orderNumber}
                    className="border-b border-rule/75 last:border-b-0"
                  >
                    <td className="max-w-[260px] px-4 py-4">
                      <Link
                        href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                        className="break-all text-[11px] font-medium text-ink transition-colors hover:text-earth"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <p className="max-w-[180px] truncate text-xs text-ink">
                        {order.user.name ?? "未设置姓名"}
                      </p>
                      <p className="mt-1 max-w-[210px] truncate text-[10px] text-muted">
                        {order.user.email}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-sm tabular-nums text-ink">
                      {formatPrice(order.totalAmount)}
                    </td>
                    <td className="px-4 py-4">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-4">
                      <AdminPaymentStatusBadge
                        status={order.paymentStatus}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[10px] text-muted">
                      {formatAdminDate(order.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-[10px] text-muted">
                      {order.paidAt
                        ? formatAdminDate(order.paidAt)
                        : "—"}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                        className="inline-flex min-h-9 items-center px-2 text-[10px] font-medium text-ink transition-colors hover:text-earth"
                      >
                        查看详情
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="mt-4 divide-y divide-rule border border-rule bg-paper md:hidden">
            {result.orders.map((order) => (
              <li key={order.orderNumber} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                      className="break-all text-xs font-medium text-ink transition-colors hover:text-earth"
                    >
                      {order.orderNumber}
                    </Link>
                    <p className="mt-2 break-words text-[11px] text-ink">
                      {order.user.name ?? "未设置姓名"}
                    </p>
                    <p className="mt-1 break-all text-[9px] text-muted">
                      {order.user.email}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium tabular-nums text-ink">
                    {formatPrice(order.totalAmount)}
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-rule/70 pt-3">
                  <div>
                    <p className="text-[8px] tracking-[0.08em] text-muted">
                      订单状态
                    </p>
                    <div className="mt-1.5">
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[8px] tracking-[0.08em] text-muted">
                      支付状态
                    </p>
                    <div className="mt-1.5">
                      <AdminPaymentStatusBadge
                        status={order.paymentStatus}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-end justify-between gap-3 border-t border-rule/70 pt-3">
                  <div>
                    <p className="text-[9px] text-muted">
                      {formatAdminDate(order.createdAt)}
                    </p>
                    <p className="mt-1 text-[9px] text-muted">
                      支付时间{" "}
                      {order.paidAt
                        ? formatAdminDate(order.paidAt)
                        : "—"}
                    </p>
                  </div>
                  <Link
                    href={`/admin/orders/${encodeURIComponent(order.orderNumber)}`}
                    className="inline-flex min-h-10 shrink-0 items-center border border-rule bg-paper px-3 text-[10px] font-medium text-ink transition-colors hover:border-ink"
                  >
                    查看详情
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          </>
        ) : (
          <AdminEmptyState
            title="没有匹配订单"
            description="调整订单编号、订单状态或支付状态后重新查询。"
            action={
              <Link
                href="/admin/orders"
                className="inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white"
              >
                清除筛选
              </Link>
            }
          />
        )}

        {result.totalPages > 1 && (
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            q={search.q}
            status={search.status}
            paymentStatus={search.paymentStatus}
          />
        )}
    </div>
  );
}

const filterInputClass =
  "min-h-11 w-full border border-rule bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-earth";

function FilterField({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[9px] font-medium tracking-[0.08em] text-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  q,
  status,
  paymentStatus,
}: {
  page: number;
  totalPages: number;
  q: string;
  status: string | undefined;
  paymentStatus: string | undefined;
}) {
  return (
    <nav
      aria-label="订单分页"
      className="flex items-center justify-between gap-4 py-6"
    >
      {page > 1 ? (
        <Link
          href={orderListHref(page - 1, q, status, paymentStatus)}
          className={paginationLinkClass}
        >
          上一页
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <span className="text-[10px] tabular-nums text-muted">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={orderListHref(page + 1, q, status, paymentStatus)}
          className={paginationLinkClass}
        >
          下一页
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}

const paginationLinkClass =
  "inline-flex min-h-10 items-center border border-rule bg-paper px-4 text-[10px] font-medium text-ink transition-colors hover:border-ink";

function orderListHref(
  page: number,
  q: string,
  status: string | undefined,
  paymentStatus: string | undefined,
) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (paymentStatus) params.set("paymentStatus", paymentStatus);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/orders?${query}` : "/admin/orders";
}

function formatAdminDate(date: Date) {
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

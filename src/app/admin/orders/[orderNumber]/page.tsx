import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminCancelOrderForm } from "@/components/admin/AdminActionForms";
import {
  AdminFlashMessage,
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { AdminPaymentStatusBadge } from "@/components/admin/AdminPaymentStatusBadge";
import { CatalogImage } from "@/components/CatalogImage";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PaymentHistory } from "@/components/orders/PaymentHistory";
import { createAdminOrderService } from "@/lib/admin-order-service";
import { requireAdmin } from "@/lib/auth-session";
import { formatPrice } from "@/lib/catalog";
import { getOrderItemImage } from "@/lib/order-query-core";
import { prisma } from "@/lib/prisma";

const orderService = createAdminOrderService({ prisma });

const flashMessages: Record<string, string> = {
  cancelled: "订单已取消。未完成支付已处理，库存已由取消事务恢复一次。",
  "already-cancelled":
    "订单此前已经取消，本次没有再次恢复库存。",
};

export default async function AdminOrderDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/orders/[orderNumber]">) {
  const { orderNumber } = await params;
  await requireAdmin(
    `/admin/orders/${encodeURIComponent(orderNumber)}`,
  );
  const query = await searchParams;
  const messageValue =
    typeof query.message === "string" ? query.message : "";
  const flashMessage = flashMessages[messageValue];
  const order = await orderService.getOrderDetail(orderNumber);

  if (!order) {
    notFound();
  }

  const paymentStatus =
    order.payments.find((payment) => payment.status === "SUCCEEDED")
      ?.status ??
    order.payments[0]?.status ??
    "UNPAID";
  const canCancel = order.status === "PENDING_PAYMENT";

  return (
    <div>
      <AdminPageHeader
        eyebrow="Order detail"
        title="订单详情"
        description={order.orderNumber}
        actions={
          <Link
            href="/admin/orders"
            className="inline-flex min-h-11 items-center border border-rule bg-paper px-5 text-[11px] font-medium tracking-[0.08em] text-ink transition-colors hover:border-ink"
          >
            返回订单列表
          </Link>
        }
      />

      {flashMessage && (
        <div className="mt-6">
          <AdminFlashMessage>{flashMessage}</AdminFlashMessage>
        </div>
      )}

      <section className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-4 border-b border-rule pb-5">
        <div>
          <p className="text-[9px] tracking-[0.1em] text-muted">
            订单状态
          </p>
          <div className="mt-2">
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
        <div>
          <p className="text-[9px] tracking-[0.1em] text-muted">
            支付状态
          </p>
          <div className="mt-2">
            <AdminPaymentStatusBadge status={paymentStatus} />
          </div>
        </div>
        <div>
          <p className="text-[9px] tracking-[0.1em] text-muted">
            订单金额
          </p>
          <p className="mt-1 text-lg font-medium tabular-nums text-ink">
            {formatPrice(order.totalAmount)}
          </p>
        </div>
        <div>
          <p className="text-[9px] tracking-[0.1em] text-muted">
            创建时间
          </p>
          <p className="mt-1 text-xs text-ink">
            {formatDate(order.createdAt)}
          </p>
        </div>
        <div>
          <p className="text-[9px] tracking-[0.1em] text-muted">
            支付时间
          </p>
          <p className="mt-1 text-xs text-ink">
            {order.paidAt ? formatDate(order.paidAt) : "—"}
          </p>
        </div>
      </section>

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="border border-rule bg-paper">
            <div className="flex items-end justify-between gap-5 border-b border-rule px-5 py-4 sm:px-6">
              <h2 className="font-serif text-2xl tracking-[-0.04em]">
                商品明细
              </h2>
              <p className="text-[10px] tabular-nums text-muted">
                {order.items.reduce(
                  (total, item) => total + item.quantity,
                  0,
                )}{" "}
                件
              </p>
            </div>
            {order.items.length > 0 ? (
              <ul>
                {order.items.map((item, index) => (
                  <li
                    key={`${item.productName}-${index}`}
                    className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-4 border-b border-rule/70 px-5 py-4 last:border-b-0 sm:px-6"
                  >
                    <div className="relative aspect-[4/5] overflow-hidden bg-[#e7dfd5]">
                      <CatalogImage
                        src={getOrderItemImage(item.productImageUrl)}
                        alt={item.productName}
                        sizes="56px"
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-ink">
                        {item.productName}
                      </p>
                      <p className="mt-1 text-[10px] text-muted">
                        单价 {formatPrice(item.unitPrice)} · 数量{" "}
                        {item.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums text-ink">
                      {formatPrice(item.subtotal)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-6 py-10 text-sm text-muted">
                该订单暂无商品快照。
              </p>
            )}
          </section>

          <section className="border border-rule bg-paper p-5 sm:p-6">
            <h2 className="font-serif text-2xl tracking-[-0.04em]">
              支付记录
            </h2>
            <div className="mt-4">
              <PaymentHistory payments={order.payments} />
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="border border-rule bg-paper p-5 sm:p-6">
            <p className="text-[9px] font-medium tracking-[0.14em] text-earth uppercase">
              Customer
            </p>
            <h2 className="mt-2 font-serif text-2xl tracking-[-0.04em]">
              下单用户
            </h2>
            <dl className="mt-5 space-y-4 text-xs">
              <InfoRow
                label="姓名"
                value={order.user.name ?? "未设置"}
              />
              <InfoRow label="邮箱" value={order.user.email} />
              <InfoRow label="用户 ID" value={order.user.id} mono />
            </dl>
          </section>

          <section className="border border-rule bg-paper p-5 sm:p-6">
            <p className="text-[9px] font-medium tracking-[0.14em] text-earth uppercase">
              Shipping snapshot
            </p>
            <h2 className="mt-2 font-serif text-2xl tracking-[-0.04em]">
              收货地址快照
            </h2>
            <dl className="mt-5 space-y-4 text-xs">
              <InfoRow label="收件人" value={order.shipping.recipientName} />
              <InfoRow label="手机号" value={order.shipping.phone} />
              <InfoRow
                label="地区"
                value={[
                  order.shipping.province,
                  order.shipping.city,
                  order.shipping.district,
                ]
                  .filter(Boolean)
                  .join(" / ")}
              />
              <InfoRow
                label="详细地址"
                value={order.shipping.addressLine}
              />
              {order.shipping.postalCode && (
                <InfoRow
                  label="邮编"
                  value={order.shipping.postalCode}
                />
              )}
            </dl>
          </section>

          <section className="border border-rule bg-paper p-5 sm:p-6">
            <p className="text-[9px] font-medium tracking-[0.14em] text-earth uppercase">
              Available action
            </p>
            <h2 className="mt-2 font-serif text-2xl tracking-[-0.04em]">
              订单操作
            </h2>
            {canCancel ? (
              <>
                <p className="mt-4 text-xs leading-6 text-muted">
                  只有待付款订单可以取消。取消事务会处理未完成支付并恢复库存一次。
                </p>
                <div className="mt-5">
                  <AdminCancelOrderForm
                    orderNumber={order.orderNumber}
                  />
                </div>
              </>
            ) : (
              <p className="mt-4 border-l-2 border-rule px-3 text-xs leading-6 text-muted">
                当前状态不支持普通订单管理操作。已支付、已完成、已取消等订单不会在后台被直接改回待付款，也不会重复恢复库存。
              </p>
            )}
          </section>

          <section className="border-y border-rule py-5 text-xs text-muted">
            <dl className="space-y-3">
              <InfoRow
                label="商品金额"
                value={formatPrice(order.itemsAmount)}
              />
              <InfoRow
                label="运费"
                value={formatPrice(order.shippingAmount)}
              />
              <InfoRow
                label="优惠"
                value={formatPrice(-order.discountAmount)}
              />
              <InfoRow
                label="取消时间"
                value={
                  order.cancelledAt
                    ? formatDate(order.cancelledAt)
                    : "—"
                }
              />
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[74px_minmax(0,1fr)] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`break-words text-right text-ink ${
          mono ? "text-[10px]" : ""
        }`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function formatDate(date: Date) {
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

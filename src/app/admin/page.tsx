import Link from "next/link";

import {
  AdminPageHeader,
} from "@/components/admin/AdminPageHeader";
import { createAdminOrderService } from "@/lib/admin-order-service";
import { requireAdmin } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const instant = false;

const orderService = createAdminOrderService({ prisma });

export default async function AdminDashboardPage() {
  const user = await requireAdmin("/admin");
  const stats = await orderService.getDashboardStats();

  return (
    <div>
        <AdminPageHeader
          eyebrow="Operations overview"
          title="运营概览"
          description={`${user.name ?? user.email}，这里是商城的实时数据快照。统计直接读取当前数据库，不使用模拟数字。`}
          actions={
            <>
              <Link
                href="/admin/products/new"
                className="inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white transition-colors hover:border-earth hover:bg-earth"
              >
                新增商品
              </Link>
              <Link
                href="/products"
                className="inline-flex min-h-11 items-center border border-rule bg-paper px-5 text-[11px] font-medium tracking-[0.08em] text-ink transition-colors hover:border-ink"
              >
                查看商城
              </Link>
            </>
          }
        />

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="商品总数"
            value={stats.productTotal}
            detail={`已上架 ${stats.activeProductCount} · 已下架 ${stats.inactiveProductCount}`}
            href="/admin/products"
          />
          <MetricCard
            label="分类总数"
            value={stats.categoryTotal}
            detail="维护商城目录结构"
            href="/admin/categories"
          />
          <MetricCard
            label="订单总数"
            value={stats.orderTotal}
            detail="包含全部历史订单"
            href="/admin/orders"
          />
          <MetricCard
            label="待付款订单"
            value={stats.pendingPaymentCount}
            detail="可进入订单详情处理取消"
            href="/admin/orders?status=PENDING_PAYMENT"
            attention
          />
          <MetricCard
            label="已支付订单"
            value={stats.paidCount}
            detail="状态为已付款"
            href="/admin/orders?status=PAID"
          />
          <MetricCard
            label="已取消订单"
            value={stats.cancelledCount}
            detail="库存恢复由取消事务完成"
            href="/admin/orders?status=CANCELLED"
          />
          <MetricCard
            label="已上架商品"
            value={stats.activeProductCount}
            detail="当前在商城可见"
            href="/admin/products?status=active"
          />
          <MetricCard
            label="已下架商品"
            value={stats.inactiveProductCount}
            detail="包括被删除归档的商品"
            href="/admin/products?status=inactive"
          />
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="border border-rule bg-paper p-6 sm:p-8">
            <p className="text-[9px] font-medium tracking-[0.18em] text-earth uppercase">
              Quick actions
            </p>
            <h2 className="mt-3 font-serif text-3xl tracking-[-0.045em]">
              常用操作
            </h2>
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <QuickAction
                href="/admin/products/new"
                title="新增商品"
                description="填写价格、库存与分类后立即上架或保存为下架状态。"
              />
              <QuickAction
                href="/admin/categories"
                title="维护分类"
                description="新增分类或调整已有分类的标识与说明。"
              />
              <QuickAction
                href="/admin/orders?status=PENDING_PAYMENT"
                title="处理订单"
                description="查看待付款订单并仅在状态机允许时取消。"
              />
            </div>
          </div>

          <div className="border border-rule bg-[#211d19] p-6 text-white sm:p-8">
            <p className="text-[9px] font-medium tracking-[0.18em] text-[#c8a988] uppercase">
              Operating note
            </p>
            <h2 className="mt-3 font-serif text-3xl tracking-[-0.045em]">
              操作边界
            </h2>
            <ul className="mt-6 space-y-4 text-xs leading-6 text-white/60">
              <li>删除商品会归档为下架状态，历史订单快照不受影响。</li>
              <li>分类仍有商品时不能删除，避免破坏目录关联。</li>
              <li>订单状态由业务 Service 控制，后台不直接改状态。</li>
            </ul>
          </div>
        </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  href,
  attention = false,
}: {
  label: string;
  value: number;
  detail: string;
  href: string;
  attention?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group min-h-[166px] border p-5 transition-colors sm:p-6 ${
        attention
          ? "border-earth/35 bg-earth/7 hover:border-earth"
          : "border-rule bg-paper hover:border-ink/40"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[11px] font-medium tracking-[0.06em] text-muted">
          {label}
        </p>
        <span
          aria-hidden="true"
          className="text-muted transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </div>
      <p className="mt-7 text-5xl font-medium tabular-nums tracking-[-0.055em] text-ink">
        {value}
      </p>
      <p className="mt-4 text-[10px] leading-5 text-muted">{detail}</p>
    </Link>
  );
}

function QuickAction({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group border border-rule p-5 transition-colors hover:border-earth hover:bg-earth/4"
    >
      <span className="font-medium text-sm text-ink">{title}</span>
      <span className="mt-2 block text-[11px] leading-5 text-muted">
        {description}
      </span>
      <span className="mt-5 inline-block text-xs text-earth transition-transform group-hover:translate-x-0.5">
        打开 →
      </span>
    </Link>
  );
}

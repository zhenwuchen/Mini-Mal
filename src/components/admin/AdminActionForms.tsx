"use client";

import { useActionState } from "react";

import {
  archiveProductAction,
  cancelAdminOrderAction,
  deleteCategoryAction,
  setProductActiveAction,
} from "@/app/admin/actions";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import {
  initialAdminActionState,
  type AdminActionState,
} from "@/lib/admin-action-state";

function ActionFeedback({ state }: { state: AdminActionState }) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={`mt-3 text-xs leading-5 ${
        state.status === "error" ? "text-[#8b3f32]" : "text-earth"
      }`}
    >
      {state.message}
    </p>
  );
}

export function ProductStatusForm({
  productId,
  isActive,
}: {
  productId: string;
  isActive: boolean;
}) {
  const [state, formAction] = useActionState(
    setProductActiveAction,
    initialAdminActionState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="productId" value={productId} />
      <input
        type="hidden"
        name="isActive"
        value={isActive ? "false" : "true"}
      />
      <AdminSubmitButton
        label={isActive ? "下架" : "上架"}
        pendingLabel="更新中…"
        variant="quiet"
      />
      <ActionFeedback state={state} />
    </form>
  );
}

export function ProductArchiveForm({
  productId,
}: {
  productId: string;
}) {
  const [state, formAction] = useActionState(
    archiveProductAction,
    initialAdminActionState,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "删除后会立即下架，并保留历史订单中的商品快照。确定继续吗？",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="productId" value={productId} />
      <AdminSubmitButton
        label="删除"
        pendingLabel="删除中…"
        variant="quiet"
      />
      <ActionFeedback state={state} />
    </form>
  );
}

export function CategoryDeleteForm({
  categoryId,
  productCount,
}: {
  categoryId: string;
  productCount: number;
}) {
  const [state, formAction] = useActionState(
    deleteCategoryAction,
    initialAdminActionState,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "分类删除后无法恢复。确定删除这个空分类吗？",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="categoryId" value={categoryId} />
      <AdminSubmitButton
        label={
          productCount > 0 ? "有商品，不能删除" : "删除分类"
        }
        pendingLabel="删除中…"
        variant="danger"
        disabled={productCount > 0}
      />
      {productCount > 0 && (
        <p className="mt-2 max-w-[220px] text-[10px] leading-4 text-muted">
          请先归档或迁移该分类下的 {productCount} 件商品。
        </p>
      )}
      <ActionFeedback state={state} />
    </form>
  );
}

export function AdminCancelOrderForm({
  orderNumber,
}: {
  orderNumber: string;
}) {
  const [state, formAction] = useActionState(
    cancelAdminOrderAction,
    initialAdminActionState,
  );

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            "取消待付款订单会同时取消未完成支付并恢复库存。确定继续吗？",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="orderNumber" value={orderNumber} />
      <AdminSubmitButton
        label="取消待付款订单"
        pendingLabel="正在取消…"
        variant="danger"
        fullWidth
      />
      <ActionFeedback state={state} />
    </form>
  );
}

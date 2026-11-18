"use client";

import {
  archiveProductAction,
  cancelAdminOrderAction,
  deleteCategoryAction,
  setProductActiveAction,
} from "@/app/admin/actions";
import { AdminMutationButton } from "@/components/admin/AdminMutationButton";

export function ProductStatusForm({
  productId,
  isActive,
}: {
  productId: string;
  isActive: boolean;
}) {
  return (
    <AdminMutationButton
      action={setProductActiveAction}
      fields={{
        productId,
        isActive: isActive ? "false" : "true",
      }}
      label={isActive ? "下架" : "上架"}
      pendingLabel="更新中…"
      variant="quiet"
    />
  );
}

export function ProductArchiveForm({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  return (
    <AdminMutationButton
      action={archiveProductAction}
      fields={{ productId }}
      label="删除"
      pendingLabel="归档中…"
      variant="dangerQuiet"
      confirmation={{
        title: "归档并下架商品？",
        description:
          "这会立即停止商品销售，但不会物理删除记录。商品仍可在“已下架”筛选中查看，历史订单中的名称、价格和图片快照会完整保留。",
        subject: productName,
        confirmLabel: "确认归档",
      }}
    />
  );
}

export function CategoryDeleteForm({
  categoryId,
  categoryName,
  productCount,
}: {
  categoryId: string;
  categoryName: string;
  productCount: number;
}) {
  return (
    <AdminMutationButton
      action={deleteCategoryAction}
      fields={{ categoryId }}
      label="删除分类"
      pendingLabel="正在删除…"
      variant="danger"
      disabled={productCount > 0}
      disabledReason={
        productCount > 0
          ? `该分类仍关联 ${productCount} 件商品。请先迁移商品；归档不会解除分类关联。`
          : undefined
      }
      confirmation={{
        title: "删除这个空分类？",
        description:
          "此操作会从数据库删除分类，且无法恢复。只有不再关联任何商品的分类可以被删除。",
        subject: categoryName,
        confirmLabel: "确认删除",
      }}
    />
  );
}

export function AdminCancelOrderForm({
  orderNumber,
}: {
  orderNumber: string;
}) {
  return (
    <AdminMutationButton
      action={cancelAdminOrderAction}
      fields={{ orderNumber }}
      label="取消待付款订单"
      pendingLabel="正在取消…"
      variant="danger"
      fullWidth
      confirmation={{
        title: "取消这笔待付款订单？",
        description:
          "取消后会处理未完成支付，并按订单商品数量恢复库存。重复取消不会再次恢复库存。",
        subject: orderNumber,
        confirmLabel: "确认取消订单",
      }}
    />
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { AdminActionState } from "@/lib/admin-action-state";
import {
  AdminCategoryError,
  createAdminCategoryService,
} from "@/lib/admin-category-service";
import { parseAdminCategoryForm } from "@/lib/admin-category";
import {
  AdminProductError,
  createAdminProductService,
} from "@/lib/admin-product-service";
import { parseAdminProductForm } from "@/lib/admin-product";
import { requireAdmin } from "@/lib/auth-session";
import {
  OrderCancelError,
  createOrderCancelService,
} from "@/lib/order-cancel-service";
import { prisma } from "@/lib/prisma";

const productService = createAdminProductService({ prisma });
const categoryService = createAdminCategoryService({ prisma });
const orderCancelService = createOrderCancelService({
  prisma,
  getCurrentUserId: async () => null,
});
const recordIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function formId(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  const id = typeof value === "string" ? value.trim() : "";

  return recordIdPattern.test(id) ? id : null;
}

function formBoolean(formData: FormData, key: string): boolean | null {
  const value = formData.get(key);

  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function errorState(message: string): AdminActionState {
  return { status: "error", message };
}

function fieldErrorsState(
  message: string,
  fieldErrors: Record<string, string>,
): AdminActionState {
  return {
    status: "error",
    message,
    fieldErrors,
  };
}

export async function saveProductAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/products");
  const parsed = parseAdminProductForm(formData);

  if (!parsed.success) {
    return fieldErrorsState("请检查商品信息。", parsed.errors);
  }

  const productId = formData.get("productId");
  const isEditing = typeof productId === "string" && productId.length > 0;
  let destination = "/admin/products?message=created";

  try {
    if (isEditing) {
      if (!recordIdPattern.test(productId)) {
        return errorState("商品信息无效，请刷新页面后重试。");
      }

      await productService.update(productId, parsed.data);
      destination = "/admin/products?message=updated";
    } else {
      await productService.create(parsed.data);
    }
  } catch (error) {
    if (error instanceof AdminProductError) {
      return errorState(error.message);
    }

    return errorState("商品保存失败，请稍后重试。");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  redirect(destination);
}

export async function setProductActiveAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/products");
  const productId = formId(formData, "productId");
  const isActive = formBoolean(formData, "isActive");

  if (!productId || isActive === null) {
    return errorState("商品状态参数无效，请刷新页面后重试。");
  }

  try {
    await productService.setActive(productId, isActive);
  } catch (error) {
    if (error instanceof AdminProductError) {
      return errorState(error.message);
    }

    return errorState("商品状态更新失败，请稍后重试。");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  redirect(
    `/admin/products?message=${isActive ? "activated" : "deactivated"}`,
  );
}

export async function archiveProductAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/products");
  const productId = formId(formData, "productId");

  if (!productId) {
    return errorState("商品参数无效，请刷新页面后重试。");
  }

  try {
    await productService.archive(productId);
  } catch (error) {
    if (error instanceof AdminProductError) {
      return errorState(error.message);
    }

    return errorState("商品删除失败，请稍后重试。");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  redirect("/admin/products?message=archived");
}

export async function saveCategoryAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/categories");
  const parsed = parseAdminCategoryForm(formData);

  if (!parsed.success) {
    return fieldErrorsState("请检查分类信息。", parsed.errors);
  }

  const categoryId = formData.get("categoryId");
  const isEditing =
    typeof categoryId === "string" && categoryId.length > 0;
  let destination = "/admin/categories?message=created";

  try {
    if (isEditing) {
      if (!recordIdPattern.test(categoryId)) {
        return errorState("分类信息无效，请刷新页面后重试。");
      }

      await categoryService.update(categoryId, parsed.data);
      destination = "/admin/categories?message=updated";
    } else {
      await categoryService.create(parsed.data);
    }
  } catch (error) {
    if (error instanceof AdminCategoryError) {
      return errorState(error.message);
    }

    return errorState("分类保存失败，请稍后重试。");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  redirect(destination);
}

export async function deleteCategoryAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/categories");
  const categoryId = formId(formData, "categoryId");

  if (!categoryId) {
    return errorState("分类参数无效，请刷新页面后重试。");
  }

  try {
    await categoryService.delete(categoryId);
  } catch (error) {
    if (error instanceof AdminCategoryError) {
      return errorState(error.message);
    }

    return errorState("分类删除失败，请稍后重试。");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/products");
  revalidatePath("/");
  redirect("/admin/categories?message=deleted");
}

export async function cancelAdminOrderAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  await requireAdmin("/admin/orders");
  const orderNumber = formId(formData, "orderNumber");

  if (!orderNumber) {
    return errorState("订单编号无效，请刷新页面后重试。");
  }

  let outcome = "cancelled";

  try {
    const result = await orderCancelService.cancelOrderAsAdmin({
      orderNumber,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/orders");
    revalidatePath(
      `/admin/orders/${encodeURIComponent(orderNumber)}`,
    );
    outcome = result.alreadyCancelled
      ? "already-cancelled"
      : "cancelled";
  } catch (error) {
    if (error instanceof OrderCancelError) {
      return errorState(error.message);
    }

    return errorState("订单取消失败，请稍后重试。");
  }

  redirect(
    `/admin/orders/${encodeURIComponent(orderNumber)}?message=${outcome}`,
  );
}

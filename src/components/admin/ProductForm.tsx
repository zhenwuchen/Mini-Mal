"use client";

import Link from "next/link";
import { useActionState } from "react";

import { saveProductAction } from "@/app/admin/actions";
import { AdminSubmitButton } from "@/components/admin/AdminSubmitButton";
import {
  initialAdminActionState,
} from "@/lib/admin-action-state";
import type { AdminProductSummary } from "@/lib/admin-product-service";
import { formatAdminPriceInput } from "@/lib/admin-product";
import { useFormValuePreservation } from "@/lib/form-value-preservation";

type CategoryOption = {
  id: string;
  name: string;
  slug: string;
};

type ProductFormProps = {
  categories: CategoryOption[];
  product?: AdminProductSummary;
};

export function ProductForm({
  categories,
  product,
}: ProductFormProps) {
  const [state, formAction] = useActionState(
    saveProductAction,
    initialAdminActionState,
  );
  const { formRef, preserveSubmittedValues } =
    useFormValuePreservation(
      state.status === "error" ? state : null,
    );

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={preserveSubmittedValues}
      className="space-y-8"
    >
      {product && (
        <input type="hidden" name="productId" value={product.id} />
      )}

      {state.status === "error" && state.message && (
        <p
          role="alert"
          className="border-l-2 border-[#8b3f32] bg-[#8b3f32]/6 px-4 py-3 text-sm leading-6 text-[#713327]"
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <FormField
          id="product-name"
          label="商品名称"
          hint="使用清晰、可识别的名称"
          error={state.fieldErrors?.name}
          className="lg:col-span-2"
        >
          <input
            id="product-name"
            name="name"
            type="text"
            required
            maxLength={120}
            defaultValue={product?.name ?? ""}
            autoComplete="off"
            className={inputClassName(state.fieldErrors?.name)}
          />
        </FormField>

        <FormField
          id="product-price"
          label="价格（元）"
          hint="人民币，最多两位小数"
          error={state.fieldErrors?.price}
        >
          <input
            id="product-price"
            name="price"
            type="number"
            required
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={
              product ? formatAdminPriceInput(product.price) : ""
            }
            className={inputClassName(state.fieldErrors?.price)}
          />
        </FormField>

        <FormField
          id="product-stock"
          label="库存"
          hint="非负整数"
          error={state.fieldErrors?.stock}
        >
          <input
            id="product-stock"
            name="stock"
            type="number"
            required
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={product?.stock ?? 0}
            className={inputClassName(state.fieldErrors?.stock)}
          />
        </FormField>

        <FormField
          id="product-category"
          label="所属分类"
          hint="分类必须已存在"
          error={state.fieldErrors?.categoryId}
        >
          <select
            id="product-category"
            name="categoryId"
            required
            defaultValue={product?.category.id ?? ""}
            className={inputClassName(state.fieldErrors?.categoryId)}
          >
            <option value="">请选择分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}（{category.slug}）
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="product-status"
          label="销售状态"
          hint="下架商品仍会保留历史订单快照"
          error={state.fieldErrors?.isActive}
        >
          <select
            id="product-status"
            name="isActive"
            defaultValue={product?.isActive === false ? "false" : "true"}
            className={inputClassName()}
          >
            <option value="true">已上架</option>
            <option value="false">已下架</option>
          </select>
        </FormField>

        <FormField
          id="product-image"
          label="商品图片地址"
          hint="仅支持 /images/ 下的本地 JPG、PNG、WebP、AVIF 或 GIF 图片"
          error={state.fieldErrors?.imageUrl}
          className="lg:col-span-2"
        >
          <input
            id="product-image"
            name="imageUrl"
            type="text"
            maxLength={500}
            defaultValue={product?.imageUrl ?? ""}
            placeholder="/images/catalog/example.jpg"
            className={inputClassName(state.fieldErrors?.imageUrl)}
          />
        </FormField>

        <FormField
          id="product-description"
          label="商品描述"
          hint="最多 2000 个字符"
          error={state.fieldErrors?.description}
          className="lg:col-span-2"
        >
          <textarea
            id="product-description"
            name="description"
            rows={6}
            maxLength={2_000}
            defaultValue={product?.description ?? ""}
            className={`${inputClassName(
              state.fieldErrors?.description,
            )} resize-y leading-7`}
          />
        </FormField>
      </div>

      <div className="flex flex-col-reverse gap-3 border-t border-rule pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/admin/products"
          className="inline-flex min-h-11 items-center text-[11px] font-medium tracking-[0.08em] text-muted transition-colors hover:text-ink"
        >
          返回商品列表
        </Link>
        <AdminSubmitButton
          label={product ? "保存商品" : "创建商品"}
          pendingLabel={product ? "保存中…" : "创建中…"}
        />
      </div>
    </form>
  );
}

function FormField({
  id,
  label,
  hint,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-[11px] font-medium tracking-[0.08em] text-ink"
      >
        {label}
      </label>
      <p className="mt-1.5 text-[10px] leading-5 text-muted">{hint}</p>
      <div className="mt-2">{children}</div>
      {error && (
        <p className="mt-2 text-xs leading-5 text-[#8b3f32]">{error}</p>
      )}
    </div>
  );
}

function inputClassName(error?: string) {
  return `min-h-12 w-full border bg-paper px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted/55 focus:border-earth ${
    error ? "border-[#8b3f32]" : "border-rule"
  }`;
}

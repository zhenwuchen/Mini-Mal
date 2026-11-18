import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ProductForm } from "@/components/admin/ProductForm";
import { createAdminProductService } from "@/lib/admin-product-service";
import { requireAdmin } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

const productService = createAdminProductService({ prisma });

export default async function EditAdminProductPage({
  params,
}: PageProps<"/admin/products/[productId]/edit">) {
  const { productId } = await params;
  await requireAdmin(
    `/admin/products/${encodeURIComponent(productId)}/edit`,
  );
  const [product, categories] = await Promise.all([
    productService.getById(productId),
    productService.getCategoryOptions(),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Edit product"
        title="编辑商品"
        description={`正在编辑「${product.name}」。保存后价格、库存与状态会直接写入数据库。`}
      />

      {categories.length === 0 ? (
        <p className="mt-8 border-l-2 border-[#8b3f32] bg-[#8b3f32]/6 px-4 py-3 text-sm text-[#713327]">
          当前没有可用分类。请先前往分类管理创建分类。
        </p>
      ) : (
        <section className="mt-8 max-w-[920px] border border-rule bg-paper p-5 sm:p-8">
          <ProductForm categories={categories} product={product} />
        </section>
      )}
    </div>
  );
}

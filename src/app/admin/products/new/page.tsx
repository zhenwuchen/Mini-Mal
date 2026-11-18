import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ProductForm } from "@/components/admin/ProductForm";
import { createAdminProductService } from "@/lib/admin-product-service";
import { requireAdmin } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const instant = false;

const productService = createAdminProductService({ prisma });

export default async function NewAdminProductPage() {
  await requireAdmin("/admin/products/new");
  const categories = await productService.getCategoryOptions();

  return (
    <div>
      <AdminPageHeader
        eyebrow="New product"
        title="新增商品"
        description="价格以人民币元输入，服务端会转换为整数分；库存、分类和上下架状态都会再次校验。"
      />

      {categories.length === 0 ? (
        <section className="mt-8 border-y border-rule py-14">
          <h2 className="font-serif text-3xl tracking-[-0.04em]">
            请先创建商品分类
          </h2>
          <p className="mt-4 max-w-[520px] text-sm leading-7 text-muted">
            商品必须关联真实存在的分类。如果直接提交不存在的分类，服务端会拒绝这次写入。
          </p>
          <Link
            href="/admin/categories"
            className="mt-7 inline-flex min-h-11 items-center border border-ink bg-ink px-5 text-[11px] font-medium tracking-[0.08em] text-white"
          >
            前往分类管理
          </Link>
        </section>
      ) : (
        <section className="mt-8 max-w-[920px] border border-rule bg-paper p-5 sm:p-8">
          <ProductForm categories={categories} />
        </section>
      )}
    </div>
  );
}

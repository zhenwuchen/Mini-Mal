import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ArrowRightIcon } from "@/components/Icons";
import { ProductCard } from "@/components/ProductCard";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductPurchasePanel } from "@/components/ProductPurchasePanel";
import { SkipLink } from "@/components/SkipLink";
import { buildProductLoginHref } from "@/lib/cart-action";
import { formatPrice } from "@/lib/catalog";
import { getProductAvailability } from "@/lib/product-purchase";
import { getProductDetail } from "@/lib/products";

type ProductDetailPageProps = {
  params: Promise<{ slug: string }>;
};

export const instant = false;

export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProductDetail(slug);

  if (!data) {
    notFound();
  }

  return {
    title: `${data.product.name} | Mini Mal1`,
    description:
      data.product.description ??
      `探索 Mini Mal1 精选商品：${data.product.name}`,
    robots: data.product.isActive ? undefined : { index: false },
  };
}

export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  const { slug } = await params;
  const data = await getProductDetail(slug);

  if (!data) notFound();

  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content">
        <ProductDetailContent data={data} />
      </main>
      <Footer />
    </>
  );
}

function ProductDetailContent({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getProductDetail>>>;
}) {
  const { product, galleryImages, relatedProducts } = data;
  const availability = getProductAvailability({
    isActive: product.isActive,
    stock: product.stock,
  });

  return (
    <>
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-7 sm:px-8 sm:pt-9 lg:px-12 xl:px-16">
        <nav
          aria-label="面包屑"
          className="flex flex-wrap items-center gap-2 text-[10px] tracking-[0.1em] text-muted uppercase"
        >
          <Link href="/" className="transition-colors hover:text-ink">
            首页
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href="/products"
            className="transition-colors hover:text-ink"
          >
            全部商品
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink">{product.name}</span>
        </nav>
      </div>

      <section className="mx-auto grid w-full max-w-[1440px] gap-10 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)] lg:gap-14 lg:px-12 lg:py-14 xl:gap-20 xl:px-16">
        <ProductGallery
          images={galleryImages}
          productName={product.name}
          imageIsFallback={product.imageIsFallback}
        />

        <div className="lg:sticky lg:top-[104px] lg:self-start">
          <Link
            href="/products"
            className="mb-8 inline-flex items-center gap-2 text-[10px] font-medium tracking-[0.12em] text-muted uppercase transition-colors hover:text-ink"
          >
            <ArrowRightIcon className="size-3.5 rotate-180" />
            返回商品列表
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={`/products?category=${product.categorySlug}`}
              className="text-[10px] font-medium tracking-[0.18em] text-earth uppercase transition-colors hover:text-ink"
            >
              {product.category}
            </Link>
            <span
              className={`inline-flex min-h-6 items-center border px-2.5 text-[9px] font-medium tracking-[0.12em] ${
                product.isActive
                  ? "border-earth/35 bg-earth/8 text-earth"
                  : "border-muted/35 bg-muted/8 text-muted"
              }`}
            >
              {product.isActive ? "在售" : "已下架"}
            </span>
          </div>
          <h1 className="mt-3 font-serif text-[2.65rem] leading-[1.02] tracking-[-0.05em] text-balance sm:text-5xl xl:text-[3.7rem]">
            {product.name}
          </h1>
          <p className="mt-5 text-2xl font-medium tabular-nums text-ink">
            {formatPrice(product.price)}
          </p>
          <p className="mt-6 max-w-[520px] text-sm leading-7 text-muted sm:text-[15px] sm:leading-8">
            {product.description ??
              "以克制的设计、细腻的材质与可靠的日常体验，为生活留下恰到好处的一件物品。"}
          </p>

          <div className="mt-8 grid grid-cols-[1fr_auto] gap-6 border-y border-rule/80 py-4 text-[11px] text-muted">
            <div>
              <p className="text-[9px] tracking-[0.14em] text-muted/80 uppercase">
                库存状态
              </p>
              <p
                className={`mt-1.5 font-medium ${
                  availability === "available" ? "text-ink" : "text-earth"
                }`}
              >
                {availability === "available"
                  ? product.stock <= 10
                    ? `仅剩 ${product.stock} 件`
                    : `现货 · 库存 ${product.stock} 件`
                  : availability === "out-of-stock"
                    ? "暂时缺货"
                    : "已下架"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[9px] tracking-[0.14em] text-muted/80 uppercase">
                商品状态
              </p>
              <p className="mt-1.5 font-medium text-ink">
                {product.isActive ? "正常销售" : "暂停销售"}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <ProductPurchasePanel
              productId={product.id}
              stock={product.stock}
              isActive={product.isActive}
              loginHref={buildProductLoginHref(product.slug)}
            />
          </div>
        </div>
      </section>

      <section className="border-y border-rule/80 bg-paper">
        <div className="mx-auto grid w-full max-w-[1440px] gap-10 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[0.8fr_1.2fr] lg:px-12 lg:py-20 xl:px-16">
          <div>
            <p className="text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
              Product details
            </p>
            <h2 className="mt-4 font-serif text-4xl tracking-[-0.045em] sm:text-5xl">
              经得起日常使用的好设计。
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <DetailBlock
              title="商品说明"
              body={
                product.description ??
                "Mini Mal1 从比例、触感与使用方式出发，为日常生活挑选耐看、耐用的物件。"
              }
            />
            <DetailBlock
              title="配送与退换"
              body="订单将在确认后尽快发出。未使用且包装完好的商品支持在签收后 7 日内申请退换，具体规则将在结算流程中说明。"
            />
            <DetailBlock
              title="材质与保养"
              body="请根据商品材质使用适当的清洁与保养方式，避免长时间暴晒或接触腐蚀性清洁剂。"
            />
            <DetailBlock
              title="服务说明"
              body="如需了解库存、尺寸或配送信息，请联系 hello@minimal1.com，我们会尽快回复。"
            />
          </div>
        </div>
      </section>

      {relatedProducts.length > 0 && (
        <section className="mx-auto w-full max-w-[1440px] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24 xl:px-16">
          <div className="mb-9 flex items-end justify-between gap-6 sm:mb-12">
            <div>
              <p className="mb-3 text-[10px] font-medium tracking-[0.2em] text-earth uppercase">
                You may also like
              </p>
              <h2 className="font-serif text-4xl tracking-[-0.045em] sm:text-5xl">
                同类精选
              </h2>
            </div>
            <Link
              href={`/products?category=${product.categorySlug}`}
              className="hidden border-b border-ink pb-1 text-[10px] tracking-[0.12em] text-ink uppercase transition-colors hover:border-earth hover:text-earth sm:block"
            >
              查看全部分类
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-4 sm:gap-y-14 lg:grid-cols-4 lg:gap-x-5">
            {relatedProducts.map((relatedProduct) => (
              <ProductCard
                key={relatedProduct.id}
                product={relatedProduct}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-t border-rule/80 pt-5">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <p className="mt-3 text-[13px] leading-6 text-muted">{body}</p>
    </div>
  );
}

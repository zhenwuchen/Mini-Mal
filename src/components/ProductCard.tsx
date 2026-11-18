import { CatalogImage } from "@/components/CatalogImage";
import { ProductCardLink } from "@/components/ProductCardLink";
import { QuickAddButton } from "@/components/QuickAddButton";
import {
  formatPrice,
  type ProductCardData,
} from "@/lib/catalog";

type ProductCardProps = {
  product: ProductCardData;
  href?: string;
  loginHref?: string;
  scrollToTopOnNavigate?: boolean;
};

export function ProductCard({
  product,
  href = `/products/${product.slug}`,
  loginHref = "/login?returnTo=%2Fproducts",
  scrollToTopOnNavigate = false,
}: ProductCardProps) {
  return (
    <article className="group">
      <div className="relative aspect-[4/5] overflow-hidden bg-[#e9e3db]">
        <ProductCardLink
          href={href}
          ariaLabel={`查看 ${product.name}`}
          className="absolute inset-0 z-10"
          scrollToTopOnNavigate={scrollToTopOnNavigate}
        >
          <CatalogImage
            src={product.image}
            alt={product.name}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        </ProductCardLink>

        {product.tag && (
          <span className="absolute top-2.5 left-2.5 z-20 border border-rule/80 bg-canvas/95 px-2 py-1 text-[8px] leading-none font-medium tracking-[0.18em] text-ink">
            {product.tag}
          </span>
        )}

        <QuickAddButton
          productId={product.id}
          productName={product.name}
          stock={product.stock}
          isActive={product.isActive}
          loginHref={loginHref}
        />
      </div>

      <div className="pt-3.5 sm:pt-4">
        <p className="text-[9px] font-medium tracking-[0.14em] text-muted uppercase sm:text-[10px]">
          {product.category}
        </p>
        <div className="mt-1.5 min-w-0">
          <h3 className="line-clamp-2 break-words text-[13px] font-medium leading-5 text-ink sm:text-sm sm:leading-6">
            <ProductCardLink
              href={href}
              className="transition-colors hover:text-earth"
              scrollToTopOnNavigate={scrollToTopOnNavigate}
            >
              {product.name}
            </ProductCardLink>
          </h3>
          <p className="mt-1 text-xs tabular-nums text-muted sm:text-[13px]">
            {formatPrice(product.price)}
          </p>
        </div>
      </div>
    </article>
  );
}

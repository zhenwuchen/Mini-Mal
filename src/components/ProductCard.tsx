import Link from "next/link";

import { CatalogImage } from "@/components/CatalogImage";
import { PlusIcon } from "@/components/Icons";
import {
  formatPrice,
  type ProductCardData,
} from "@/lib/catalog";

type ProductCardProps = {
  product: ProductCardData;
  href?: string;
};

export function ProductCard({
  product,
  href = `/products/${product.slug}`,
}: ProductCardProps) {
  return (
    <article className="group">
      <div className="relative aspect-[4/5] overflow-hidden bg-[#e9e3db]">
        <Link
          href={href}
          aria-label={`查看 ${product.name}`}
          className="absolute inset-0 z-10"
        >
          <CatalogImage
            src={product.image}
            alt={product.name}
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.02] motion-reduce:transition-none"
          />
        </Link>

        {product.tag && (
          <span className="absolute top-2.5 left-2.5 z-20 border border-rule/80 bg-canvas/95 px-2 py-1 text-[8px] leading-none font-medium tracking-[0.18em] text-ink">
            {product.tag}
          </span>
        )}

        <button
          type="button"
          aria-label={`将 ${product.name} 加入购物袋`}
          className="absolute inset-x-0 bottom-0 z-20 flex translate-y-full items-center justify-center gap-2 border-t border-ink/10 bg-canvas/95 px-4 py-3.5 text-[9px] font-medium tracking-[0.16em] text-ink uppercase opacity-0 backdrop-blur-sm transition-[opacity,transform] duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 max-lg:translate-y-0 max-lg:opacity-100"
        >
          <PlusIcon className="size-3.5" />
          加入购物袋
        </button>
      </div>

      <div className="pt-3.5 sm:pt-4">
        <p className="text-[9px] font-medium tracking-[0.14em] text-muted uppercase sm:text-[10px]">
          {product.category}
        </p>
        <div className="mt-1.5 min-w-0">
          <h3 className="line-clamp-2 break-words text-[13px] font-medium leading-5 text-ink sm:text-sm sm:leading-6">
            <Link
              href={href}
              className="transition-colors hover:text-earth"
            >
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-xs tabular-nums text-muted sm:text-[13px]">
            {formatPrice(product.price)}
          </p>
        </div>
      </div>
    </article>
  );
}

import { CatalogImage } from "@/components/CatalogImage";
import type { ProductGalleryImage } from "@/lib/product-catalog";

type ProductGalleryProps = {
  images: ProductGalleryImage[];
  productName: string;
  imageIsFallback: boolean;
};

export function ProductGallery({
  images,
  productName,
  imageIsFallback,
}: ProductGalleryProps) {
  const [primaryImage, ...supportingImages] = images;

  if (!primaryImage) {
    return (
      <div
        role="img"
        aria-label={`${productName} 暂无商品图片`}
        className="flex aspect-[4/5] items-center justify-center bg-[#e9e3db] text-muted"
      >
        <span className="font-serif text-3xl tracking-[-0.08em]">MM</span>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <figure className="relative aspect-[4/5] overflow-hidden bg-[#e9e3db]">
        <CatalogImage
          src={primaryImage.src}
          alt={primaryImage.alt}
          sizes="(max-width: 1024px) 100vw, 58vw"
          preload
          className="object-cover"
        />
        {imageIsFallback && (
          <figcaption className="absolute top-4 left-4 max-w-[calc(100%-2rem)] border border-rule/80 bg-canvas/95 px-3 py-2 text-[10px] leading-4 tracking-[0.08em] text-muted backdrop-blur-sm">
            商品主图暂缺，当前展示分类图片
          </figcaption>
        )}
      </figure>

      {supportingImages.length > 0 && (
        <div
          aria-label={`${productName} 补充商品图片`}
          className="mt-3 grid grid-cols-2 gap-3"
        >
          {supportingImages.map((image) => (
            <figure
            key={image.src}
              className="min-w-0"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-[#e9e3db]">
                <CatalogImage
                  src={image.src}
                  alt={image.alt}
                  sizes="(max-width: 1024px) 50vw, 29vw"
                  className="object-cover"
                />
              </div>
              <figcaption className="mt-2 text-[10px] tracking-[0.1em] text-muted uppercase">
                {image.label}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

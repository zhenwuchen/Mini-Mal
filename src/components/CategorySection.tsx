import Link from "next/link";

import { CatalogImage } from "@/components/CatalogImage";
import { ArrowRightIcon } from "@/components/Icons";
import { categories } from "@/lib/catalog";

export function CategorySection() {
  return (
    <section
      id="categories"
      aria-labelledby="category-heading"
      className="mx-auto w-full max-w-[1440px] px-5 py-[4.5rem] sm:px-8 sm:py-20 lg:px-12 lg:py-24 xl:px-16 xl:py-28"
    >
      <div className="mb-9 flex flex-col justify-between gap-5 sm:mb-12 sm:flex-row sm:items-end lg:mb-14">
        <div>
          <p className="mb-4 text-[10px] font-medium tracking-[0.24em] text-earth uppercase">
            Shop by category
          </p>
          <h2
            id="category-heading"
            className="max-w-[620px] font-serif text-[2.15rem] leading-[1.08] tracking-[-0.045em] text-balance sm:text-[2.9rem] lg:text-[3.4rem]"
          >
            从日常出发，
            <br className="hidden sm:block" />
            选择恰到好处的物件。
          </h2>
        </div>
        <p className="max-w-[290px] text-[13px] leading-6 text-muted sm:text-right">
          不追逐短暂潮流，只保留经得起使用与时间考验的日常选择。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 sm:gap-y-9 lg:grid-cols-4 lg:gap-x-5">
        {categories.map((category) => (
          <Link
            key={category.name}
            href={category.href}
            className="group block focus-visible:outline-offset-4"
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-[#e8e0d6]">
              <CatalogImage
                src={category.image}
                alt=""
                sizes="(max-width: 768px) 50vw, (max-width: 1440px) 25vw, 360px"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025] motion-reduce:transition-none"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_52%,rgba(24,20,17,0.62)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-white sm:p-5">
                <div>
                  <p className="mb-1 text-[9px] font-medium tracking-[0.18em] text-white/70 uppercase sm:text-[10px]">
                    {category.name}
                  </p>
                  <h3 className="font-serif text-[1.35rem] tracking-[-0.035em] sm:text-[1.65rem]">
                    {category.label}
                  </h3>
                </div>
                <ArrowRightIcon className="mb-1 size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </div>
            </div>
            <p className="mt-2.5 text-[11px] leading-5 text-muted sm:text-xs">
              {category.description}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

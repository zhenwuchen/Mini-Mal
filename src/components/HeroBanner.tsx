import Link from "next/link";

import { CatalogImage } from "@/components/CatalogImage";
import { ArrowRightIcon } from "@/components/Icons";

export function HeroBanner() {
  return (
    <section
      id="top"
      aria-labelledby="hero-heading"
      className="relative min-h-[520px] overflow-hidden bg-stone-900 sm:min-h-[560px] md:min-h-[580px] lg:min-h-[600px] xl:min-h-[620px]"
    >
      <CatalogImage
        src="/images/hero-living-room.jpg"
        alt="自然光下的现代极简客厅，浅色沙发与温润木质陈设"
        sizes="(max-width: 1440px) 100vw, 1440px"
        loading="eager"
        className="object-cover object-[72%_44%] brightness-[1.06] saturate-[0.92] sm:object-[66%_48%] lg:object-[60%_50%]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(28,23,19,0.52)_0%,rgba(28,23,19,0.32)_48%,rgba(28,23,19,0.03)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(28,23,19,0)_18%,rgba(28,23,19,0.34)_100%)] lg:hidden" />

      <div className="relative mx-auto flex min-h-[520px] w-full max-w-[1440px] items-end px-5 pb-10 pt-24 sm:min-h-[560px] sm:px-8 sm:pb-12 md:min-h-[580px] md:items-center md:pb-0 lg:min-h-[600px] lg:px-12 xl:min-h-[620px] xl:px-16">
        <div className="max-w-[660px] text-[#faf7f2]">
          <p className="mb-4 text-[9px] font-medium tracking-[0.26em] text-white/70 uppercase sm:text-[10px]">
            Curated for everyday living
          </p>
          <h1
            id="hero-heading"
            className="max-w-[620px] font-serif text-[clamp(2.55rem,6.2vw,5.9rem)] leading-[0.96] tracking-[-0.052em] text-balance"
          >
            发现生活中的
            <br />
            美好日常
          </h1>
          <p className="mt-5 max-w-[300px] text-[13px] leading-6 text-white/78 sm:max-w-[470px] sm:text-[15px] sm:leading-7">
            精选实用好物，以简约设计和细腻质感，让每一天都值得期待。
          </p>
          <Link
            href="#products"
            className="group mt-7 inline-flex min-h-12 items-center gap-4 border border-white/30 bg-[#faf7f2] px-6 py-3.5 text-[10px] font-medium tracking-[0.15em] text-ink uppercase transition-[background-color,border-color,color,transform] duration-300 hover:-translate-y-px hover:border-ink hover:bg-ink hover:text-white focus-visible:border-ink focus-visible:bg-ink focus-visible:text-white active:translate-y-0"
          >
            探索精选商品
            <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        </div>

        <p className="absolute right-12 bottom-8 hidden text-[10px] tracking-[0.22em] text-white/55 uppercase lg:block xl:right-16">
          Edition 01 / 2026
        </p>
      </div>
    </section>
  );
}

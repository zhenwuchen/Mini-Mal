import { CatalogImage } from "@/components/CatalogImage";

const principles = [
  {
    number: "01",
    title: "减法设计",
    description: "去掉多余装饰，让比例、触感与功能成为主角。",
  },
  {
    number: "02",
    title: "材质优先",
    description: "选择经得住触摸和时间的材料，尊重天然纹理。",
  },
  {
    number: "03",
    title: "长久陪伴",
    description: "不为一季而设计，让每件物品自然融入生活。",
  },
];

export function BrandStory() {
  return (
    <section
      id="story"
      aria-labelledby="brand-story-heading"
      className="bg-[#e9e2d8]"
    >
      <div className="mx-auto grid w-full max-w-[1440px] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative min-h-[460px] overflow-hidden sm:min-h-[620px] lg:min-h-[760px]">
          <CatalogImage
            src="/images/brand-story.jpg"
            alt="温暖自然光中的藤编家具与陶瓷器物"
            sizes="(max-width: 1024px) 100vw, 45vw"
            className="object-cover object-center"
          />
        </div>

        <div className="flex items-center px-5 py-16 sm:px-8 sm:py-20 lg:px-16 lg:py-24 xl:px-24">
          <div className="max-w-[620px]">
            <p className="mb-5 text-[10px] font-medium tracking-[0.24em] text-earth uppercase">
              Our point of view
            </p>
            <h2
              id="brand-story-heading"
              className="font-serif text-5xl leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl"
            >
              Less,
              <br />
              But Better.
            </h2>
            <p className="mt-8 max-w-[540px] text-sm leading-7 text-muted sm:text-base sm:leading-8">
              Mini
              Mal1
              相信，好的日常不需要被过多物品填满。我们从设计、材质与使用体验出发，挑选能够安静融入生活的物件，让每一次选择都更少，却更准确。
            </p>

            <div className="mt-12 border-t border-ink/15">
              {principles.map((principle) => (
                <div
                  key={principle.number}
                  className="grid grid-cols-[42px_1fr] gap-4 border-b border-ink/15 py-5 sm:grid-cols-[56px_1fr]"
                >
                  <span className="pt-1 text-[10px] tracking-[0.16em] text-earth">
                    {principle.number}
                  </span>
                  <div>
                    <h3 className="text-sm font-medium text-ink">
                      {principle.title}
                    </h3>
                    <p className="mt-1 text-xs leading-6 text-muted sm:text-sm">
                      {principle.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";

export function Footer() {
  return (
    <footer id="footer" className="bg-[#211d19] text-[#f4efe8]">
      <div className="mx-auto w-full max-w-[1440px] px-5 pb-8 pt-16 sm:px-8 sm:pt-20 lg:px-12 xl:px-16">
        <div className="grid gap-12 border-b border-white/12 pb-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.7fr_0.7fr_1fr]">
          <div>
            <Link
              href="/"
              className="font-serif text-3xl tracking-[-0.05em]"
            >
              Mini Mal1<span className="text-[#c9a98b]">.</span>
            </Link>
            <p className="mt-5 max-w-[360px] text-sm leading-7 text-white/58">
              精选简约、耐用、有质感的日常好物。让生活少一点喧闹，多一点恰到好处。
            </p>
          </div>

          <FooterLinks
            title="商品"
            links={[
              { label: "全部商品", href: "/products" },
              { label: "商品分类", href: "/#categories" },
              { label: "品牌故事", href: "/#story" },
            ]}
          />
          <FooterLinks
            title="客户服务"
            links={[
              { label: "配送与退换", href: "mailto:hello@minimal1.com" },
              { label: "常见问题", href: "mailto:hello@minimal1.com" },
              { label: "隐私政策", href: "#footer" },
            ]}
          />

          <div>
            <h2 className="text-[10px] font-medium tracking-[0.2em] text-white/45 uppercase">
              联系我们
            </h2>
            <div className="mt-5 space-y-3 text-sm text-white/65">
              <a
                href="mailto:hello@minimal1.com"
                className="block transition-colors hover:text-white"
              >
                hello@minimal1.com
              </a>
              <p>周一至周五 10:00–18:00</p>
              <p>Shanghai, China</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-7 text-[10px] tracking-[0.08em] text-white/38 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Mini Mal1. All rights reserved.</p>
          <p>Designed for everyday living.</p>
        </div>
      </div>
    </footer>
  );
}

type FooterLinksProps = {
  title: string;
  links: Array<{ label: string; href: string }>;
};

function FooterLinks({ title, links }: FooterLinksProps) {
  return (
    <div>
      <h2 className="text-[10px] font-medium tracking-[0.2em] text-white/45 uppercase">
        {title}
      </h2>
      <nav aria-label={title} className="mt-5 flex flex-col gap-3">
        {links.map((link) => (
          <FooterLink key={link.label} {...link} />
        ))}
      </nav>
    </div>
  );
}

function FooterLink({ label, href }: { label: string; href: string }) {
  const className =
    "w-fit text-sm text-white/65 transition-colors hover:text-white";

  if (href.startsWith("#")) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }

  return (
    <a href={href} className={className}>
      {label}
    </a>
  );
}

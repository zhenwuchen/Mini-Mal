import Link from "next/link";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SkipLink } from "@/components/SkipLink";

type AuthPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  note: string;
  alternateLabel: string;
  alternateText: string;
  alternateHref: string;
  children: React.ReactNode;
};

export function AuthPageShell({
  eyebrow,
  title,
  description,
  note,
  alternateLabel,
  alternateText,
  alternateHref,
  children,
}: AuthPageShellProps) {
  return (
    <>
      <SkipLink />
      <Header />
      <main id="main-content" className="border-b border-rule/70">
        <div className="mx-auto grid w-full max-w-[1440px] lg:grid-cols-[0.88fr_1.12fr]">
          <section className="border-b border-rule/70 px-5 py-12 sm:px-8 sm:py-16 lg:min-h-[calc(100dvh-72px)] lg:border-r lg:border-b-0 lg:px-12 lg:py-20 xl:px-16">
            <nav
              aria-label="面包屑"
              className="flex items-center gap-3 text-[10px] tracking-[0.12em] text-muted uppercase"
            >
              <Link href="/" className="transition-colors hover:text-ink">
                首页
              </Link>
              <span aria-hidden="true">/</span>
              <span className="text-ink">账户</span>
            </nav>

            <div className="mt-14 max-w-[560px] lg:mt-24">
              <p className="text-[10px] font-medium tracking-[0.22em] text-earth uppercase">
                {eyebrow}
              </p>
              <h1 className="mt-5 max-w-[520px] font-serif text-[3.25rem] leading-[0.98] tracking-[-0.055em] text-balance sm:text-7xl lg:text-[5.1rem]">
                {title}
              </h1>
              <p className="mt-7 max-w-[460px] text-sm leading-7 text-muted sm:text-[15px] sm:leading-8">
                {description}
              </p>
            </div>

            <div className="mt-14 border-t border-rule/80 pt-5 lg:mt-24">
              <p className="max-w-[420px] text-[11px] leading-6 text-muted">
                {note}
              </p>
            </div>
          </section>

          <section className="flex items-center px-5 py-12 sm:px-8 sm:py-16 lg:px-14 lg:py-20 xl:px-20">
            <div className="mx-auto w-full max-w-[520px]">
              {children}
              <div className="mt-12 border-t border-rule/80 pt-5 text-sm text-muted">
                <span>{alternateLabel}</span>{" "}
                <Link
                  href={alternateHref}
                  className="border-b border-ink pb-0.5 font-medium text-ink transition-colors hover:border-earth hover:text-earth"
                >
                  {alternateText}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}

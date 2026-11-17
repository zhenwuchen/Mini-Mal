import { BrandStory } from "@/components/BrandStory";
import { CategorySection } from "@/components/CategorySection";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { HeroBanner } from "@/components/HeroBanner";
import { ProductSection } from "@/components/ProductSection";

export default function Home() {
  return (
    <>
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[100] -translate-y-24 bg-ink px-4 py-3 text-sm text-white transition-transform focus:translate-y-0"
      >
        跳至主要内容
      </a>
      <Header />
      <main id="main-content">
        <HeroBanner />
        <CategorySection />
        <ProductSection />
        <BrandStory />
      </main>
      <Footer />
    </>
  );
}

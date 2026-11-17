import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mini Mal1 | 现代生活方式精选",
  description:
    "Mini Mal1 精选简约、耐用、有质感的日常好物，以克制设计让每一天更值得期待。",
  keywords: ["Mini Mal1", "生活方式", "精选好物", "现代简约", "电商"],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      <body className="bg-canvas text-ink">{children}</body>
    </html>
  );
}

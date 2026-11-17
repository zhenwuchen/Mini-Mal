export type ProductCategory =
  | "Electronics"
  | "Fashion"
  | "Home & Living"
  | "Beauty";

export type ProductTag = "BESTSELLER" | "NEW" | "LIMITED";

export type ProductCardData = {
  id: string;
  name: string;
  slug: string;
  price: number;
  image: string;
  category: string;
  tag?: ProductTag;
};

export type ShoppingCategory = {
  name: ProductCategory;
  label: string;
  description: string;
  image: string;
  href: string;
};

export const categories: ShoppingCategory[] = [
  {
    name: "Electronics",
    label: "数码电子",
    description: "让技术安静地融入日常",
    image: "/images/categories/electronics.jpg",
    href: "#products",
  },
  {
    name: "Fashion",
    label: "服饰穿搭",
    description: "克制剪裁与自然质地",
    image: "/images/categories/fashion.jpg",
    href: "#products",
  },
  {
    name: "Home & Living",
    label: "家居生活",
    description: "为空间留下呼吸的余地",
    image: "/images/categories/home-living.jpg",
    href: "#products",
  },
  {
    name: "Beauty",
    label: "美妆个护",
    description: "温和而有效的每日仪式",
    image: "/images/categories/beauty.jpg",
    href: "#products",
  },
];

export const formatPrice = (priceInFen: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(priceInFen / 100);

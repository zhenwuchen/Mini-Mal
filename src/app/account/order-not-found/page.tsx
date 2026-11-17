import type { Metadata } from "next";

import { OrderNotFoundState } from "@/components/orders/OrderNotFoundState";

export const metadata: Metadata = {
  title: "订单未找到 | Mini Mal1",
  robots: {
    index: false,
    follow: false,
  },
};

export default function OrderNotFoundPage() {
  return <OrderNotFoundState />;
}

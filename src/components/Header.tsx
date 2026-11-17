import { Suspense } from "react";

import { HeaderClient } from "@/components/HeaderClient";
import { getCurrentUser } from "@/lib/auth-session";
import { getCart } from "@/lib/cart";

export function Header() {
  return (
    <Suspense
      fallback={
        <HeaderClient
          user={null}
          cartQuantity={0}
          sessionPending
        />
      }
    >
      <SessionHeader />
    </Suspense>
  );
}

async function SessionHeader() {
  const user = await getCurrentUser();
  const cart = user ? await getCart() : null;

  return (
    <HeaderClient
      user={user}
      cartQuantity={cart?.totalQuantity ?? 0}
    />
  );
}

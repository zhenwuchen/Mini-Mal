const CART_BADGE_LIMIT = 99;

function normalizeCartQuantity(totalQuantity: number): number {
  return Number.isSafeInteger(totalQuantity) && totalQuantity > 0
    ? totalQuantity
    : 0;
}

export function formatCartBadgeQuantity(
  totalQuantity: number,
): string | null {
  const quantity = normalizeCartQuantity(totalQuantity);

  if (quantity === 0) return null;
  return quantity > CART_BADGE_LIMIT ? "99+" : String(quantity);
}

export function getCartAriaLabel(totalQuantity: number): string {
  const quantity = normalizeCartQuantity(totalQuantity);

  return quantity > 0 ? `购物车，${quantity} 件商品` : "购物车，当前为空";
}

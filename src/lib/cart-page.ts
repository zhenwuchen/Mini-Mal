export const cartFallbackImage = "/images/categories/home-living.jpg";
export const cartLoginHref = "/login?returnTo=%2Fcart";

export type CartItemAvailability =
  | "available"
  | "out-of-stock"
  | "inactive";

export function getCartItemImage(
  imageUrl: string | null | undefined,
): string {
  const normalized = imageUrl?.trim();
  return normalized || cartFallbackImage;
}

export function getCartItemAvailability({
  isActive,
  stock,
}: {
  isActive: boolean;
  stock: number;
}): CartItemAvailability {
  if (!isActive) return "inactive";
  if (stock <= 0) return "out-of-stock";
  return "available";
}

export function canDecreaseCartQuantity({
  quantity,
  stock,
}: {
  quantity: number;
  stock: number;
}): boolean {
  return quantity > 1 && quantity - 1 <= stock;
}

export function canIncreaseCartQuantity({
  quantity,
  stock,
  isActive,
}: {
  quantity: number;
  stock: number;
  isActive: boolean;
}): boolean {
  return isActive && stock > 0 && quantity < stock;
}

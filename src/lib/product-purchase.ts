export type ProductAvailability = "available" | "out-of-stock" | "inactive";

type ProductStockState = {
  isActive: boolean;
  stock: number;
};

type AddToCartInput = ProductStockState & {
  quantity: number;
};

export function getProductAvailability({
  isActive,
  stock,
}: ProductStockState): ProductAvailability {
  if (!isActive) return "inactive";
  if (stock <= 0) return "out-of-stock";
  return "available";
}

export function getPurchaseQuantityLimit(stock: number): number {
  return Math.max(0, Math.floor(stock));
}

export function canAddToCart({
  isActive,
  stock,
  quantity,
}: AddToCartInput): boolean {
  return (
    getProductAvailability({ isActive, stock }) === "available" &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= stock
  );
}

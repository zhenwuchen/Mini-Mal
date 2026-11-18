const PRODUCT_DETAIL_SCROLL_INTENT_KEY =
  "minimal1:scroll-product-detail-to-top";

export type ProductDetailScrollStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export function getProductDetailScrollStorage():
  | ProductDetailScrollStorage
  | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markProductDetailScrollIntent(
  storage: ProductDetailScrollStorage | null =
    getProductDetailScrollStorage(),
) {
  if (!storage) return;

  try {
    storage.setItem(PRODUCT_DETAIL_SCROLL_INTENT_KEY, "1");
  } catch {
    // Navigation still works if browser storage is unavailable.
  }
}

export function consumeProductDetailScrollIntent(
  storage: ProductDetailScrollStorage | null =
    getProductDetailScrollStorage(),
): boolean {
  if (!storage) return false;

  try {
    const hasIntent =
      storage.getItem(PRODUCT_DETAIL_SCROLL_INTENT_KEY) === "1";

    if (hasIntent) {
      storage.removeItem(PRODUCT_DETAIL_SCROLL_INTENT_KEY);
    }

    return hasIntent;
  } catch {
    return false;
  }
}

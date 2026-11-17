import type { CartMutationActionState } from "@/lib/cart-action-state";
import {
  CartError,
  type CartErrorCode,
  type CartSummary,
} from "@/lib/cart-service";

type UpdateCartItemQuantity = (input: {
  cartItemId: string;
  quantity: number;
}) => Promise<CartSummary>;

type RemoveCartItem = (cartItemId: string) => Promise<CartSummary>;

const cartItemMutationMessages: Record<CartErrorCode, string> = {
  UNAUTHENTICATED: "登录状态已失效，请重新登录后继续。",
  INVALID_QUANTITY: "数量无效，请选择正整数。",
  PRODUCT_NOT_FOUND: "商品已被移除，可以删除该购物车商品。",
  PRODUCT_INACTIVE: "商品已下架，无法增加数量。",
  OUT_OF_STOCK: "商品暂时缺货，无法增加数量。",
  INSUFFICIENT_STOCK: "库存不足，请减少数量后再试。",
  CART_ITEM_NOT_FOUND: "商品已不在购物车中，请刷新页面。",
  CART_BUSY: "购物车暂时繁忙，请稍后重试。",
};

function readCartItemId(formData: FormData): string | null {
  const value = formData.get("cartItemId");
  const cartItemId = typeof value === "string" ? value.trim() : "";

  if (
    !cartItemId ||
    cartItemId.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(cartItemId)
  ) {
    return null;
  }

  return cartItemId;
}

function readQuantity(formData: FormData): number | null {
  const value = formData.get("quantity");
  const quantityText = typeof value === "string" ? value.trim() : "";
  const quantity = Number(quantityText);

  if (
    !/^[1-9]\d*$/.test(quantityText) ||
    !Number.isSafeInteger(quantity)
  ) {
    return null;
  }

  return quantity;
}

function toErrorState(
  error: unknown,
  cartItemId: string,
  quantity?: number,
): CartMutationActionState {
  if (error instanceof CartError) {
    return {
      status:
        error.code === "UNAUTHENTICATED"
          ? "unauthenticated"
          : "error",
      message: cartItemMutationMessages[error.code],
      cartItemId,
      quantity,
    };
  }

  return {
    status: "error",
    message: "购物车更新失败，请稍后重试。",
    cartItemId,
    quantity,
  };
}

export async function executeUpdateCartItemQuantity(
  formData: FormData,
  updateCartItemQuantity: UpdateCartItemQuantity,
): Promise<CartMutationActionState> {
  const cartItemId = readCartItemId(formData);
  const quantity = readQuantity(formData);

  if (!cartItemId) {
    return {
      status: "error",
      message: "购物车商品信息无效，请刷新页面。",
    };
  }

  if (quantity === null) {
    return {
      status: "error",
      message: "数量无效，请选择正整数。",
      cartItemId,
    };
  }

  try {
    const cart = await updateCartItemQuantity({ cartItemId, quantity });

    return {
      status: "success",
      message: "商品数量已更新。",
      cartItemId,
      quantity,
      totalQuantity: cart.totalQuantity,
    };
  } catch (error) {
    return toErrorState(error, cartItemId, quantity);
  }
}

export async function executeRemoveCartItem(
  formData: FormData,
  removeCartItem: RemoveCartItem,
): Promise<CartMutationActionState> {
  const cartItemId = readCartItemId(formData);

  if (!cartItemId) {
    return {
      status: "error",
      message: "购物车商品信息无效，请刷新页面。",
    };
  }

  try {
    const cart = await removeCartItem(cartItemId);

    return {
      status: "success",
      message: "商品已从购物车移除。",
      cartItemId,
      totalQuantity: cart.totalQuantity,
    };
  } catch (error) {
    return toErrorState(error, cartItemId);
  }
}

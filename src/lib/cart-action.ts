import type { AddToCartActionState } from "@/lib/cart-action-state";
import { CartError, type CartErrorCode } from "@/lib/cart-service";
import type { CartSummary } from "@/lib/cart-service";
import { sanitizeAuthRedirect } from "@/lib/auth-validation";

type AddCartItem = (input: {
  productId: string;
  quantity: number;
}) => Promise<CartSummary>;

type ParsedCartInput =
  | {
      success: true;
      productId: string;
      quantity: number;
    }
  | {
      success: false;
      state: AddToCartActionState;
    };

const cartErrorStates: Record<
  CartErrorCode,
  AddToCartActionState
> = {
  UNAUTHENTICATED: {
    status: "unauthenticated",
    message: "登录后才能把商品加入购物车。",
  },
  INVALID_QUANTITY: {
    status: "error",
    message: "购买数量无效，请选择正整数。",
  },
  PRODUCT_NOT_FOUND: {
    status: "error",
    message: "商品不存在或已被移除，请返回商品列表重新选择。",
  },
  PRODUCT_INACTIVE: {
    status: "error",
    message: "该商品已下架，暂时无法加入购物车。",
  },
  OUT_OF_STOCK: {
    status: "error",
    message: "该商品暂时缺货，请稍后再试。",
  },
  INSUFFICIENT_STOCK: {
    status: "error",
    message: "库存不足，请减少购买数量后再试。",
  },
  CART_ITEM_NOT_FOUND: {
    status: "error",
    message: "购物车商品状态已变化，请刷新页面后重试。",
  },
  CART_BUSY: {
    status: "error",
    message: "购物车暂时繁忙，请稍后重试。",
  },
};

function parseCartInput(formData: FormData): ParsedCartInput {
  const rawProductId = formData.get("productId");
  const rawQuantity = formData.get("quantity");
  const productId =
    typeof rawProductId === "string" ? rawProductId.trim() : "";

  if (
    !productId ||
    productId.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(productId)
  ) {
    return {
      success: false,
      state: {
        status: "error",
        message: "商品信息无效，请刷新页面后重试。",
      },
    };
  }

  const quantityText =
    typeof rawQuantity === "string" ? rawQuantity.trim() : "";
  const quantity = Number(quantityText);

  if (
    !/^[1-9]\d*$/.test(quantityText) ||
    !Number.isSafeInteger(quantity)
  ) {
    return {
      success: false,
      state: {
        status: "error",
        message: "购买数量无效，请选择正整数。",
      },
    };
  }

  return {
    success: true,
    productId,
    quantity,
  };
}

export function buildProductLoginHref(slug: string): string {
  const returnTo = sanitizeAuthRedirect(
    `/products/${encodeURIComponent(slug)}`,
  );

  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export async function executeAddToCart(
  formData: FormData,
  addCartItem: AddCartItem,
): Promise<AddToCartActionState> {
  const parsed = parseCartInput(formData);

  if (!parsed.success) {
    return parsed.state;
  }

  try {
    const cart = await addCartItem({
      productId: parsed.productId,
      quantity: parsed.quantity,
    });

    return {
      status: "success",
      message: `已加入购物车，当前共 ${cart.totalQuantity} 件商品。`,
      submittedQuantity: parsed.quantity,
      totalQuantity: cart.totalQuantity,
    };
  } catch (error) {
    if (error instanceof CartError) {
      return {
        ...cartErrorStates[error.code],
        submittedQuantity: parsed.quantity,
      };
    }

    return {
      status: "error",
      message: "暂时无法加入购物车，请稍后重试。",
      submittedQuantity: parsed.quantity,
    };
  }
}

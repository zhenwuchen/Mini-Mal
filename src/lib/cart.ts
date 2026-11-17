import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth-session";
import { createCartService } from "@/lib/cart-service";
import { prisma } from "@/lib/prisma";

const cartService = createCartService({
  prisma,
  getCurrentUserId: async () => {
    const user = await getCurrentUser();
    return user?.id ?? null;
  },
});

export const getCart = cache(cartService.getCart);
export const addCartItem = cartService.addCartItem;
export const updateCartItemQuantity =
  cartService.updateCartItemQuantity;
export const removeCartItem = cartService.removeCartItem;
export const clearCart = cartService.clearCart;

export {
  CartError,
  type AddCartItemInput,
  type CartErrorCode,
  type CartItemSummary,
  type CartSummary,
  type UpdateCartItemQuantityInput,
} from "@/lib/cart-service";

"use server";

import { refresh } from "next/cache";

import {
  addCartItem,
  removeCartItem,
  updateCartItemQuantity,
} from "@/lib/cart";
import { executeAddToCart } from "@/lib/cart-action";
import {
  executeRemoveCartItem,
  executeUpdateCartItemQuantity,
} from "@/lib/cart-line-action";
import type {
  AddToCartActionState,
  CartMutationActionState,
} from "@/lib/cart-action-state";

export async function addToCartAction(
  _previousState: AddToCartActionState,
  formData: FormData,
): Promise<AddToCartActionState> {
  const state = await executeAddToCart(formData, addCartItem);

  if (state.status === "success") {
    refresh();
  }

  return state;
}

export async function updateCartItemQuantityAction(
  _previousState: CartMutationActionState,
  formData: FormData,
): Promise<CartMutationActionState> {
  const state = await executeUpdateCartItemQuantity(
    formData,
    updateCartItemQuantity,
  );

  if (state.status === "success") {
    refresh();
  }

  return state;
}

export async function removeCartItemAction(
  _previousState: CartMutationActionState,
  formData: FormData,
): Promise<CartMutationActionState> {
  const state = await executeRemoveCartItem(formData, removeCartItem);

  if (state.status === "success") {
    refresh();
  }

  return state;
}

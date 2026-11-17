export type AddToCartActionStatus =
  | "idle"
  | "success"
  | "error"
  | "unauthenticated";

export type AddToCartActionState = {
  status: AddToCartActionStatus;
  message?: string;
  submittedQuantity?: number;
  totalQuantity?: number;
};

export const initialAddToCartActionState: AddToCartActionState = {
  status: "idle",
};

export type CartMutationActionStatus =
  | "idle"
  | "success"
  | "error"
  | "unauthenticated";

export type CartMutationActionState = {
  status: CartMutationActionStatus;
  message?: string;
  cartItemId?: string;
  quantity?: number;
  totalQuantity?: number;
};

export const initialCartMutationActionState: CartMutationActionState = {
  status: "idle",
};

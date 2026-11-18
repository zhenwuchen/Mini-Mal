"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/lib/address";
import {
  executeAddressCreate,
  executeAddressDelete,
  executeAddressSetDefault,
  executeAddressUpdate,
  type AddressActionState,
} from "@/lib/address-action";

export async function createAddressAction(
  _previousState: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  const state = await executeAddressCreate(formData, createAddress);

  if (state.status === "success") {
    revalidatePath("/account/addresses");
    redirect("/account/addresses?saved=1");
  }

  return state;
}

export async function updateAddressAction(
  _previousState: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  const state = await executeAddressUpdate(formData, updateAddress);

  if (state.status === "success") {
    revalidatePath("/account/addresses");
    redirect("/account/addresses?saved=1");
  }

  return state;
}

export async function deleteAddressAction(
  _previousState: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  const state = await executeAddressDelete(formData, deleteAddress);

  if (state.status === "success") {
    revalidatePath("/account/addresses");
  }

  return state;
}

export async function setDefaultAddressAction(
  _previousState: AddressActionState,
  formData: FormData,
): Promise<AddressActionState> {
  const state = await executeAddressSetDefault(
    formData,
    setDefaultAddress,
  );

  if (state.status === "success") {
    revalidatePath("/account/addresses");
  }

  return state;
}

import "server-only";

import { cache } from "react";

import { createAddressService } from "@/lib/address-service";
import { getCurrentUser } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

const addressService = createAddressService({
  prisma,
  getCurrentUserId: async () => {
    const user = await getCurrentUser();
    return user?.id ?? null;
  },
});

export const getAddresses = cache(addressService.getAddresses);
export const getAddress = addressService.getAddress;
export const createAddress = addressService.createAddress;
export const updateAddress = addressService.updateAddress;
export const setDefaultAddress = addressService.setDefaultAddress;
export const deleteAddress = addressService.deleteAddress;

export {
  AddressError,
  type AddressErrorCode,
  type AddressField,
  type AddressSummary,
  type CreateAddressInput,
  type UpdateAddressInput,
} from "@/lib/address-service";

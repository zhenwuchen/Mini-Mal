import {
  AddressError,
  type AddressField,
  type CreateAddressInput,
  type UpdateAddressInput,
} from "@/lib/address-service";

export type AddressActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  addressId?: string;
  fieldErrors?: Partial<Record<AddressField, string>>;
};

export const initialAddressActionState: AddressActionState = {
  status: "idle",
};

type AddressMutationResult = {
  id: string;
};

type CreateAddress = (
  input: CreateAddressInput,
) => Promise<AddressMutationResult>;
type UpdateAddress = (
  addressId: string,
  input: UpdateAddressInput,
) => Promise<AddressMutationResult>;
type DeleteAddress = (addressId: string) => Promise<void>;
type SetDefaultAddress = (
  addressId: string,
) => Promise<AddressMutationResult>;

const addressIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readAddressId(formData: FormData): string | null {
  const addressId = readText(formData, "addressId");
  return addressIdPattern.test(addressId) ? addressId : null;
}

function readAddressInput(formData: FormData): CreateAddressInput {
  return {
    recipientName: readText(formData, "recipientName"),
    phone: readText(formData, "phone"),
    province: readText(formData, "province"),
    city: readText(formData, "city"),
    district: readText(formData, "district"),
    addressLine: readText(formData, "addressLine"),
    postalCode: readText(formData, "postalCode") || null,
    isDefault:
      formData.get("isDefault") === "true" ||
      formData.get("isDefault") === "on",
  };
}

function invalidAddressIdState(): AddressActionState {
  return {
    status: "error",
    message: "地址信息无效，请刷新页面后重试。",
  };
}

function toAddressErrorState(error: unknown): AddressActionState {
  if (error instanceof AddressError) {
    return {
      status: "error",
      message: error.message,
      fieldErrors: error.fieldErrors,
    };
  }

  return {
    status: "error",
    message: "地址操作失败，请稍后重试。",
  };
}

export async function executeAddressCreate(
  formData: FormData,
  createAddress: CreateAddress,
): Promise<AddressActionState> {
  try {
    const address = await createAddress(readAddressInput(formData));

    return {
      status: "success",
      message: "收货地址已保存。",
      addressId: address.id,
    };
  } catch (error) {
    return toAddressErrorState(error);
  }
}

export async function executeAddressUpdate(
  formData: FormData,
  updateAddress: UpdateAddress,
): Promise<AddressActionState> {
  const addressId = readAddressId(formData);

  if (!addressId) {
    return invalidAddressIdState();
  }

  try {
    const address = await updateAddress(
      addressId,
      readAddressInput(formData),
    );

    return {
      status: "success",
      message: "收货地址已更新。",
      addressId: address.id,
    };
  } catch (error) {
    return toAddressErrorState(error);
  }
}

export async function executeAddressDelete(
  formData: FormData,
  deleteAddress: DeleteAddress,
): Promise<AddressActionState> {
  const addressId = readAddressId(formData);

  if (!addressId) {
    return invalidAddressIdState();
  }

  try {
    await deleteAddress(addressId);

    return {
      status: "success",
      message: "收货地址已删除。",
      addressId,
    };
  } catch (error) {
    return toAddressErrorState(error);
  }
}

export async function executeAddressSetDefault(
  formData: FormData,
  setDefaultAddress: SetDefaultAddress,
): Promise<AddressActionState> {
  const addressId = readAddressId(formData);

  if (!addressId) {
    return invalidAddressIdState();
  }

  try {
    const address = await setDefaultAddress(addressId);

    return {
      status: "success",
      message: "默认地址已更新。",
      addressId: address.id,
    };
  } catch (error) {
    return toAddressErrorState(error);
  }
}

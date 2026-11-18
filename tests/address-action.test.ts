import assert from "node:assert/strict";
import test from "node:test";

import {
  AddressError,
  type CreateAddressInput,
  type UpdateAddressInput,
} from "../src/lib/address-service";
import {
  executeAddressCreate,
  executeAddressDelete,
  executeAddressSetDefault,
  executeAddressUpdate,
} from "../src/lib/address-action";

function addressForm(
  values: Record<string, string | boolean> = {},
): FormData {
  const formData = new FormData();
  const defaults: Record<string, string | boolean> = {
    recipientName: "  张三  ",
    phone: " 13800138000 ",
    province: " 浙江省 ",
    city: " 杭州市 ",
    district: " 西湖区 ",
    addressLine: " 文三路 1 号 ",
    postalCode: " 310000 ",
    isDefault: true,
    ...values,
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (typeof value === "boolean") {
      if (value) formData.set(key, "true");
    } else {
      formData.set(key, value);
    }
  }

  return formData;
}

test("creates an address from normalized server input without accepting ownership", async () => {
  let received: CreateAddressInput | undefined;
  const formData = addressForm({ userId: "another-user" });

  const state = await executeAddressCreate(formData, async (input) => {
    received = input;
    return { id: "address-1" };
  });

  assert.deepEqual(received, {
    recipientName: "张三",
    phone: "13800138000",
    province: "浙江省",
    city: "杭州市",
    district: "西湖区",
    addressLine: "文三路 1 号",
    postalCode: "310000",
    isDefault: true,
  });
  assert.equal(state.status, "success");
  assert.equal(state.addressId, "address-1");
});

test("updates only the selected address fields and default state", async () => {
  let addressId = "";
  let received: UpdateAddressInput | undefined;
  const formData = addressForm({
    addressId: "address-2",
    isDefault: false,
    city: " 宁波市 ",
  });

  const state = await executeAddressUpdate(
    formData,
    async (selectedAddressId, input) => {
      addressId = selectedAddressId;
      received = input;
      return { id: selectedAddressId };
    },
  );

  assert.equal(addressId, "address-2");
  assert.deepEqual(received, {
    recipientName: "张三",
    phone: "13800138000",
    province: "浙江省",
    city: "宁波市",
    district: "西湖区",
    addressLine: "文三路 1 号",
    postalCode: "310000",
    isDefault: false,
  });
  assert.equal(state.status, "success");
});

test("returns service field errors without leaking an unexpected exception", async () => {
  const state = await executeAddressCreate(addressForm(), async () => {
    throw new AddressError("INVALID_ADDRESS", {
      phone: "请输入有效的手机号",
    });
  });

  assert.equal(state.status, "error");
  assert.equal(state.fieldErrors?.phone, "请输入有效的手机号");
});

test("deletes and defaults only a validated address identifier", async () => {
  const deleted: string[] = [];
  const defaulted: string[] = [];
  const deleteState = await executeAddressDelete(
    addressForm({ addressId: "address-3" }),
    async (addressId) => {
      deleted.push(addressId);
    },
  );
  const defaultState = await executeAddressSetDefault(
    addressForm({ addressId: "address-4" }),
    async (addressId) => {
      defaulted.push(addressId);
      return { id: addressId };
    },
  );

  assert.deepEqual(deleted, ["address-3"]);
  assert.deepEqual(defaulted, ["address-4"]);
  assert.equal(deleteState.status, "success");
  assert.equal(defaultState.status, "success");
});

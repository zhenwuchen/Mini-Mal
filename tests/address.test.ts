import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient, type Address, type User } from "@prisma/client";

import {
  AddressError,
  createAddressService,
  type AddressErrorCode,
  type AddressField,
  type CreateAddressInput,
} from "../src/lib/address-service";

const prisma = new PrismaClient();
const testPrefix = `phase06-3-address-${process.pid}-${Date.now()}`;
let fixtureSequence = 0;

function nextFixtureName(label: string) {
  fixtureSequence += 1;
  return `${testPrefix}-${fixtureSequence}-${label}`;
}

async function createUser(label: string): Promise<User> {
  const fixture = nextFixtureName(label);

  return prisma.user.create({
    data: {
      name: `Address Service Test ${label}`,
      email: `${fixture}@example.com`,
      passwordHash: "not-used-in-address-service-tests",
    },
  });
}

function serviceFor(userId: string | null) {
  return createAddressService({
    prisma,
    getCurrentUserId: async () => userId,
  });
}

function createAddressInput(
  label: string,
  overrides: Partial<CreateAddressInput> = {},
): CreateAddressInput {
  return {
    recipientName: `Recipient ${label}`,
    phone: "13800138000",
    province: "上海市",
    city: "上海市",
    district: "徐汇区",
    addressLine: `${label} 路 100 号`,
    postalCode: "200000",
    isDefault: true,
    ...overrides,
  };
}

function assertAddressError(
  error: unknown,
  code: AddressErrorCode,
  expectedMessage?: string,
) {
  assert.ok(error instanceof AddressError);
  assert.equal(error.code, code);
  if (expectedMessage) {
    assert.equal(error.message, expectedMessage);
  }
}

async function findAddress(addressId: string) {
  return prisma.address.findUnique({ where: { id: addressId } });
}

async function setAddressCreatedAt(addressId: string, createdAt: Date) {
  await prisma.address.update({
    where: { id: addressId },
    data: { createdAt },
  });
}

async function createOrderForAddress(user: User, address: Address) {
  const fixture = nextFixtureName("order");

  return prisma.order.create({
    data: {
      orderNumber: `${fixture}-number`,
      userId: user.id,
      checkoutKey: `${fixture}-checkout`,
      itemsAmount: 2000,
      shippingAmount: 500,
      totalAmount: 2500,
      status: "PENDING_PAYMENT",
      shippingAddressId: address.id,
      shippingName: "Legacy Snapshot Name",
      shippingPhone: "13800138000",
      shippingAddress: "上海市徐汇区快照路 100 号",
      shippingRecipientName: "Snapshot Recipient",
      shippingProvince: "上海市",
      shippingCity: "上海市",
      shippingDistrict: "徐汇区",
      shippingAddressLine: "快照路 100 号",
      shippingPostalCode: "200000",
    },
  });
}

test.after(async () => {
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: testPrefix } },
  });
  await prisma.user.deleteMany({
    where: { email: { startsWith: testPrefix } },
  });
  await prisma.$disconnect();
});

test("rejects every address operation when no user is signed in", async () => {
  const service = serviceFor(null);
  const operations = [
    () => service.getAddresses(),
    () => service.getAddress("missing-address"),
    () => service.createAddress(createAddressInput("signed-out")),
    () => service.updateAddress("missing-address", { city: "杭州市" }),
    () => service.setDefaultAddress("missing-address"),
    () => service.deleteAddress("missing-address"),
  ];

  for (const operation of operations) {
    await assert.rejects(operation, (error) => {
      assertAddressError(error, "UNAUTHENTICATED");
      return true;
    });
  }
});

test("a user can create multiple addresses and only sees their own", async () => {
  const userA = await createUser("multiple-a");
  const userB = await createUser("multiple-b");
  const serviceA = serviceFor(userA.id);
  const serviceB = serviceFor(userB.id);

  await serviceA.createAddress(createAddressInput("a-home"));
  await serviceA.createAddress(
    createAddressInput("a-office", { isDefault: false }),
  );
  await serviceB.createAddress(createAddressInput("b-home"));

  const addresses = await serviceA.getAddresses();
  assert.equal(addresses.length, 2);
  assert.ok(
    addresses.every((address) => address.recipientName.startsWith("Recipient")),
  );
  assert.equal("userId" in addresses[0], false);
  assert.equal("passwordHash" in addresses[0], false);
  assert.equal((await serviceB.getAddresses()).length, 1);
});

test("the first address becomes default even when isDefault is false", async () => {
  const user = await createUser("first-default");
  const address = await serviceFor(user.id).createAddress(
    createAddressInput("first", { isDefault: false }),
  );

  assert.equal(address.isDefault, true);
  assert.equal(
    (await findAddress(address.id))?.isDefault,
    true,
  );
});

test("lists the default first and other addresses newest first", async () => {
  const user = await createUser("sort");
  const service = serviceFor(user.id);
  const first = await service.createAddress(createAddressInput("first"));
  const second = await service.createAddress(
    createAddressInput("second", { isDefault: false }),
  );
  const third = await service.createAddress(
    createAddressInput("third", { isDefault: false }),
  );

  await setAddressCreatedAt(first.id, new Date("2026-01-01T00:00:00Z"));
  await setAddressCreatedAt(second.id, new Date("2026-01-02T00:00:00Z"));
  await setAddressCreatedAt(third.id, new Date("2026-01-03T00:00:00Z"));

  const addresses = await service.getAddresses();
  assert.deepEqual(
    addresses.map((address) => address.id),
    [first.id, third.id, second.id],
  );
});

test("creating a new default clears the previous default", async () => {
  const user = await createUser("create-default");
  const service = serviceFor(user.id);
  const first = await service.createAddress(createAddressInput("first"));
  const second = await service.createAddress(
    createAddressInput("second", { isDefault: true }),
  );

  assert.equal((await findAddress(first.id))?.isDefault, false);
  assert.equal((await findAddress(second.id))?.isDefault, true);
  assert.equal(
    (await service.getAddresses()).filter((address) => address.isDefault)
      .length,
    1,
  );
});

test("updating a current default without isDefault keeps it default", async () => {
  const user = await createUser("preserve-default");
  const service = serviceFor(user.id);
  const first = await service.createAddress(createAddressInput("first"));
  await service.createAddress(
    createAddressInput("second", { isDefault: false }),
  );

  const updated = await service.updateAddress(first.id, {
    recipientName: "  Updated Recipient  ",
    city: "  杭州市  ",
  });

  assert.equal(updated.recipientName, "Updated Recipient");
  assert.equal(updated.city, "杭州市");
  assert.equal(updated.isDefault, true);
});

test("the only address cannot be made non-default", async () => {
  const user = await createUser("only-address");
  const service = serviceFor(user.id);
  const address = await service.createAddress(createAddressInput("only"));

  await assert.rejects(
    service.updateAddress(address.id, { isDefault: false }),
    (error) => {
      assertAddressError(error, "LAST_ADDRESS_MUST_BE_DEFAULT");
      return true;
    },
  );
  assert.equal((await findAddress(address.id))?.isDefault, true);
});

test("updating a default address switches the default atomically", async () => {
  const user = await createUser("update-default");
  const service = serviceFor(user.id);
  const first = await service.createAddress(createAddressInput("first"));
  const second = await service.createAddress(
    createAddressInput("second", { isDefault: false }),
  );

  const updated = await service.updateAddress(second.id, {
    isDefault: true,
    addressLine: "更新后的地址",
  });

  assert.equal(updated.isDefault, true);
  assert.equal((await findAddress(first.id))?.isDefault, false);
  assert.equal(
    (await service.getAddresses()).filter((address) => address.isDefault)
      .length,
    1,
  );
});

test("setting the current default again is safe and keeps one default", async () => {
  const user = await createUser("set-default");
  const service = serviceFor(user.id);
  const first = await service.createAddress(createAddressInput("first"));
  const second = await service.createAddress(
    createAddressInput("second", { isDefault: false }),
  );

  await service.setDefaultAddress(second.id);
  await service.setDefaultAddress(second.id);

  assert.equal((await findAddress(first.id))?.isDefault, false);
  assert.equal((await findAddress(second.id))?.isDefault, true);
  assert.equal(
    (await service.getAddresses()).filter((address) => address.isDefault)
      .length,
    1,
  );
});

test("deleting a non-default address keeps the current default", async () => {
  const user = await createUser("delete-non-default");
  const service = serviceFor(user.id);
  const first = await service.createAddress(createAddressInput("first"));
  const second = await service.createAddress(
    createAddressInput("second", { isDefault: false }),
  );

  await service.deleteAddress(second.id);

  const remaining = await service.getAddresses();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, first.id);
  assert.equal(remaining[0].isDefault, true);
});

test("deleting the default promotes the newest remaining address", async () => {
  const user = await createUser("delete-default");
  const service = serviceFor(user.id);
  const first = await service.createAddress(createAddressInput("first"));
  const second = await service.createAddress(
    createAddressInput("second", { isDefault: false }),
  );
  const third = await service.createAddress(
    createAddressInput("third", { isDefault: false }),
  );

  await setAddressCreatedAt(first.id, new Date("2026-01-01T00:00:00Z"));
  await setAddressCreatedAt(second.id, new Date("2026-01-02T00:00:00Z"));
  await setAddressCreatedAt(third.id, new Date("2026-01-03T00:00:00Z"));
  await service.deleteAddress(first.id);

  const remaining = await service.getAddresses();
  assert.deepEqual(
    remaining.map((address) => address.id),
    [third.id, second.id],
  );
  assert.equal((await findAddress(third.id))?.isDefault, true);
  assert.equal((await findAddress(second.id))?.isDefault, false);
});

test("deleting the final address leaves an empty address list", async () => {
  const user = await createUser("delete-last");
  const service = serviceFor(user.id);
  const address = await service.createAddress(createAddressInput("last"));

  await service.deleteAddress(address.id);

  assert.deepEqual(await service.getAddresses(), []);
  assert.equal(await prisma.address.count({ where: { userId: user.id } }), 0);
});

test("user A cannot read, update, default, or delete user B's address", async () => {
  const userA = await createUser("isolation-a");
  const userB = await createUser("isolation-b");
  const serviceA = serviceFor(userA.id);
  const serviceB = serviceFor(userB.id);
  const addressB = await serviceB.createAddress(
    createAddressInput("private-b"),
  );

  const operations = [
    () => serviceA.getAddress(addressB.id),
    () => serviceA.updateAddress(addressB.id, { city: "北京市" }),
    () => serviceA.setDefaultAddress(addressB.id),
    () => serviceA.deleteAddress(addressB.id),
  ];

  for (const operation of operations) {
    await assert.rejects(operation, (error) => {
      assertAddressError(error, "ADDRESS_NOT_FOUND");
      return true;
    });
  }

  const unchanged = await findAddress(addressB.id);
  assert.equal(unchanged?.userId, userB.id);
  assert.equal(unchanged?.city, "上海市");
  assert.equal(unchanged?.isDefault, true);
});

test("missing and unowned addresses return the same not-found error", async () => {
  const user = await createUser("uniform-not-found");
  const other = await createUser("uniform-not-found-other");
  const ownService = serviceFor(user.id);
  const otherAddress = await serviceFor(other.id).createAddress(
    createAddressInput("other"),
  );
  let expectedMessage = "";

  await assert.rejects(
    ownService.getAddress("missing-address"),
    (error) => {
      assertAddressError(error, "ADDRESS_NOT_FOUND");
      if (error instanceof AddressError) {
        expectedMessage = error.message;
      }
      return true;
    },
  );

  const operations = [
    () => ownService.getAddress(otherAddress.id),
    () => ownService.updateAddress(otherAddress.id, { city: "北京市" }),
    () => ownService.setDefaultAddress(otherAddress.id),
    () => ownService.deleteAddress(otherAddress.id),
  ];

  for (const operation of operations) {
    await assert.rejects(operation, (error) => {
      assertAddressError(error, "ADDRESS_NOT_FOUND", expectedMessage);
      return true;
    });
  }
});

test("validates required fields, phone, lengths, and isDefault", async () => {
  const user = await createUser("validation");
  const service = serviceFor(user.id);
  const invalidInputs: Array<{
    input: CreateAddressInput;
    field: AddressField;
  }> = [
    {
      input: createAddressInput("blank-name", { recipientName: "   " }),
      field: "recipientName",
    },
    {
      input: createAddressInput("bad-phone", { phone: "not-a-phone" }),
      field: "phone",
    },
    {
      input: createAddressInput("long-city", { city: "城".repeat(51) }),
      field: "city",
    },
    {
      input: createAddressInput("long-address", {
        addressLine: "路".repeat(201),
      }),
      field: "addressLine",
    },
    {
      input: createAddressInput("bad-default", {
        isDefault: "true" as unknown as boolean,
      }),
      field: "isDefault",
    },
  ];

  for (const { input, field } of invalidInputs) {
    await assert.rejects(service.createAddress(input), (error) => {
      assert.ok(error instanceof AddressError);
      assert.equal(error.code, "INVALID_ADDRESS");
      assert.ok(error.fieldErrors[field]);
      return true;
    });
  }
  assert.equal(await prisma.address.count({ where: { userId: user.id } }), 0);
});

test("trims strings, normalizes an empty postal code, and ignores userId", async () => {
  const user = await createUser("normalize");
  const other = await createUser("normalize-other");
  const service = serviceFor(user.id);
  const input = {
    ...createAddressInput("normalize", {
      recipientName: "  张三  ",
      province: "  浙江省  ",
      city: "  杭州市  ",
      district: "  西湖区  ",
      addressLine: "  文三路 1 号  ",
      postalCode: "   ",
    }),
    userId: other.id,
  };

  const address = await service.createAddress(input);
  const saved = await findAddress(address.id);

  assert.equal(saved?.recipientName, "张三");
  assert.equal(saved?.province, "浙江省");
  assert.equal(saved?.city, "杭州市");
  assert.equal(saved?.district, "西湖区");
  assert.equal(saved?.addressLine, "文三路 1 号");
  assert.equal(saved?.postalCode, null);
  assert.equal(saved?.userId, user.id);
});

test("deleting an address preserves the order and its full snapshot", async () => {
  const user = await createUser("delete-snapshot");
  const service = serviceFor(user.id);
  const address = await service.createAddress(
    createAddressInput("delete-snapshot"),
  );
  const dbAddress = await findAddress(address.id);
  assert.ok(dbAddress);
  const order = await createOrderForAddress(user, dbAddress);

  await service.deleteAddress(address.id);

  const savedOrder = await prisma.order.findUnique({
    where: { id: order.id },
  });
  assert.ok(savedOrder);
  assert.equal(savedOrder.shippingAddressId, null);
  assert.equal(savedOrder.shippingRecipientName, "Snapshot Recipient");
  assert.equal(savedOrder.shippingProvince, "上海市");
  assert.equal(savedOrder.shippingCity, "上海市");
  assert.equal(savedOrder.shippingDistrict, "徐汇区");
  assert.equal(savedOrder.shippingAddressLine, "快照路 100 号");
  assert.equal(savedOrder.shippingPostalCode, "200000");
});

test("updating an address does not change historical order snapshots", async () => {
  const user = await createUser("update-snapshot");
  const service = serviceFor(user.id);
  const address = await service.createAddress(
    createAddressInput("update-snapshot"),
  );
  const dbAddress = await findAddress(address.id);
  assert.ok(dbAddress);
  const order = await createOrderForAddress(user, dbAddress);

  await service.updateAddress(address.id, {
    recipientName: "新收件人",
    city: "杭州市",
    addressLine: "新地址 999 号",
  });

  const savedOrder = await prisma.order.findUnique({
    where: { id: order.id },
  });
  assert.ok(savedOrder);
  assert.equal(savedOrder.shippingAddressId, address.id);
  assert.equal(savedOrder.shippingRecipientName, "Snapshot Recipient");
  assert.equal(savedOrder.shippingCity, "上海市");
  assert.equal(savedOrder.shippingAddressLine, "快照路 100 号");
});

test("concurrent default changes leave exactly one default address", async () => {
  const user = await createUser("concurrent");
  const service = serviceFor(user.id);

  await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      service.createAddress(
        createAddressInput(`concurrent-${index}`, { isDefault: true }),
      ),
    ),
  );

  const addresses = await service.getAddresses();
  assert.equal(addresses.length, 5);
  assert.equal(addresses.filter((address) => address.isDefault).length, 1);
  assert.equal(
    await prisma.address.count({
      where: { userId: user.id, isDefault: true },
    }),
    1,
  );
});

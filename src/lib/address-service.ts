import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

export type AddressErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_ADDRESS"
  | "ADDRESS_NOT_FOUND"
  | "LAST_ADDRESS_MUST_BE_DEFAULT"
  | "ADDRESS_BUSY";

export type AddressField =
  | "recipientName"
  | "phone"
  | "province"
  | "city"
  | "district"
  | "addressLine"
  | "postalCode"
  | "isDefault";

const addressErrorMessages: Record<AddressErrorCode, string> = {
  UNAUTHENTICATED: "请先登录后再操作收货地址",
  INVALID_ADDRESS: "收货地址信息不完整或格式不正确",
  ADDRESS_NOT_FOUND: "收货地址不存在",
  LAST_ADDRESS_MUST_BE_DEFAULT:
    "仅有一条收货地址时，不能取消默认地址",
  ADDRESS_BUSY: "收货地址操作繁忙，请稍后重试",
};

export class AddressError extends Error {
  readonly code: AddressErrorCode;
  readonly fieldErrors: Partial<Record<AddressField, string>>;

  constructor(
    code: AddressErrorCode,
    fieldErrors: Partial<Record<AddressField, string>> = {},
  ) {
    super(addressErrorMessages[code]);
    this.name = "AddressError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export type AddressSummary = {
  id: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateAddressInput = {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode?: string | null;
  isDefault?: boolean;
};

export type UpdateAddressInput = Partial<CreateAddressInput>;

export type AddressService = {
  getAddresses(): Promise<AddressSummary[]>;
  getAddress(addressId: string): Promise<AddressSummary>;
  createAddress(input: CreateAddressInput): Promise<AddressSummary>;
  updateAddress(
    addressId: string,
    input: UpdateAddressInput,
  ): Promise<AddressSummary>;
  setDefaultAddress(addressId: string): Promise<AddressSummary>;
  deleteAddress(addressId: string): Promise<void>;
};

type AddressServiceDependencies = {
  prisma: PrismaClient;
  getCurrentUserId: () => Promise<string | null>;
};

type NormalizedCreateAddressInput = {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
};

type NormalizedUpdateAddressInput = Partial<
  NormalizedCreateAddressInput
>;

type RequiredAddressTextField = Extract<
  AddressField,
  "recipientName" | "province" | "city" | "district" | "addressLine"
>;

const MAX_WRITE_ATTEMPTS = 5;

const addressSummarySelect = {
  id: true,
  recipientName: true,
  phone: true,
  province: true,
  city: true,
  district: true,
  addressLine: true,
  postalCode: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AddressSelect;

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function isRetryableWriteError(error: unknown): boolean {
  if (
    isPrismaErrorCode(error, "P2028") ||
    isPrismaErrorCode(error, "P2034")
  ) {
    return true;
  }

  return (
    error instanceof Error &&
    (error.message.includes("database is locked") ||
      error.message.includes("database table is locked") ||
      error.message.includes("Transaction API error") ||
      error.message.includes("Transaction already closed"))
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function executeWithRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableWriteError(error)) {
        throw error;
      }

      if (attempt === MAX_WRITE_ATTEMPTS) {
        throw new AddressError("ADDRESS_BUSY");
      }

      await wait(attempt * 25);
    }
  }

  throw new AddressError("ADDRESS_BUSY");
}

function hasOwn(
  input: object,
  field: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function readRequiredString(
  input: Record<string, unknown>,
  field: AddressField,
  label: string,
  maxLength: number,
  fieldErrors: Partial<Record<AddressField, string>>,
): string {
  const value = input[field];

  if (typeof value !== "string" || !value.trim()) {
    fieldErrors[field] = `请输入${label}`;
    return "";
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    fieldErrors[field] = `${label}不能超过 ${maxLength} 个字符`;
    return "";
  }

  return normalized;
}

function readPhone(
  input: Record<string, unknown>,
  fieldErrors: Partial<Record<AddressField, string>>,
): string {
  const value = input.phone;

  if (typeof value !== "string" || !value.trim()) {
    fieldErrors.phone = "请输入手机号";
    return "";
  }

  const normalized = value.trim();
  const digitCount = normalized.replace(/\D/g, "").length;

  if (
    normalized.length > 20 ||
    !/^\+?[0-9\s()-]+$/.test(normalized) ||
    digitCount < 6 ||
    digitCount > 15
  ) {
    fieldErrors.phone = "请输入有效的手机号";
    return "";
  }

  return normalized;
}

function readPostalCode(
  input: Record<string, unknown>,
  fieldErrors: Partial<Record<AddressField, string>>,
): string | null {
  const value = input.postalCode;

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    fieldErrors.postalCode = "请输入有效的邮政编码";
    return null;
  }

  const normalized = value.trim();

  if (normalized.length > 20) {
    fieldErrors.postalCode = "邮政编码不能超过 20 个字符";
    return null;
  }

  return normalized || null;
}

function readIsDefault(
  input: Record<string, unknown>,
  fieldErrors: Partial<Record<AddressField, string>>,
  fallback = false,
): boolean {
  const value = input.isDefault;

  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    fieldErrors.isDefault = "默认地址设置无效";
    return fallback;
  }

  return value;
}

function normalizeCreateInput(
  input: CreateAddressInput,
): NormalizedCreateAddressInput {
  const candidate =
    input && typeof input === "object"
      ? (input as unknown as Record<string, unknown>)
      : {};
  const fieldErrors: Partial<Record<AddressField, string>> = {};

  const normalized = {
    recipientName: readRequiredString(
      candidate,
      "recipientName",
      "收件人姓名",
      50,
      fieldErrors,
    ),
    phone: readPhone(candidate, fieldErrors),
    province: readRequiredString(
      candidate,
      "province",
      "省份",
      50,
      fieldErrors,
    ),
    city: readRequiredString(
      candidate,
      "city",
      "城市",
      50,
      fieldErrors,
    ),
    district: readRequiredString(
      candidate,
      "district",
      "区县",
      50,
      fieldErrors,
    ),
    addressLine: readRequiredString(
      candidate,
      "addressLine",
      "详细地址",
      200,
      fieldErrors,
    ),
    postalCode: readPostalCode(candidate, fieldErrors),
    isDefault: readIsDefault(candidate, fieldErrors),
  };

  if (Object.keys(fieldErrors).length > 0) {
    throw new AddressError("INVALID_ADDRESS", fieldErrors);
  }

  return normalized;
}

function normalizeUpdateInput(
  input: UpdateAddressInput,
): NormalizedUpdateAddressInput {
  const candidate =
    input && typeof input === "object"
      ? (input as unknown as Record<string, unknown>)
      : {};
  const fieldErrors: Partial<Record<AddressField, string>> = {};
  const normalized: NormalizedUpdateAddressInput = {};
  const requiredFields: Array<{
    field: RequiredAddressTextField;
    label: string;
    maxLength: number;
  }> = [
    {
      field: "recipientName",
      label: "收件人姓名",
      maxLength: 50,
    },
    { field: "province", label: "省份", maxLength: 50 },
    { field: "city", label: "城市", maxLength: 50 },
    { field: "district", label: "区县", maxLength: 50 },
    { field: "addressLine", label: "详细地址", maxLength: 200 },
  ];

  for (const { field, label, maxLength } of requiredFields) {
    if (hasOwn(candidate, field) && candidate[field] !== undefined) {
      normalized[field] = readRequiredString(
        candidate,
        field,
        label,
        maxLength,
        fieldErrors,
      );
    }
  }

  if (hasOwn(candidate, "phone") && candidate.phone !== undefined) {
    normalized.phone = readPhone(candidate, fieldErrors);
  }

  if (
    hasOwn(candidate, "postalCode") &&
    candidate.postalCode !== undefined
  ) {
    normalized.postalCode = readPostalCode(candidate, fieldErrors);
  }

  if (hasOwn(candidate, "isDefault") && candidate.isDefault !== undefined) {
    normalized.isDefault = readIsDefault(candidate, fieldErrors);
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new AddressError("INVALID_ADDRESS", fieldErrors);
  }

  return normalized;
}

function normalizeAddressId(addressId: string): string {
  const normalized =
    typeof addressId === "string" ? addressId.trim() : "";

  if (
    !normalized ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new AddressError("ADDRESS_NOT_FOUND");
  }

  return normalized;
}

export function createAddressService({
  prisma,
  getCurrentUserId,
}: AddressServiceDependencies): AddressService {
  async function requireCurrentUserId(): Promise<string> {
    const userId = await getCurrentUserId();

    if (!userId) {
      throw new AddressError("UNAUTHENTICATED");
    }

    return userId;
  }

  async function getAddresses(): Promise<AddressSummary[]> {
    const userId = await requireCurrentUserId();

    return prisma.address.findMany({
      where: { userId },
      select: addressSummarySelect,
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
  }

  async function getAddress(addressId: string): Promise<AddressSummary> {
    const userId = await requireCurrentUserId();
    const normalizedAddressId = normalizeAddressId(addressId);
    const address = await prisma.address.findFirst({
      where: {
        id: normalizedAddressId,
        userId,
      },
      select: addressSummarySelect,
    });

    if (!address) {
      throw new AddressError("ADDRESS_NOT_FOUND");
    }

    return address;
  }

  async function createAddress(
    input: CreateAddressInput,
  ): Promise<AddressSummary> {
    const userId = await requireCurrentUserId();
    const normalized = normalizeCreateInput(input);

    return executeWithRetry(() =>
      prisma.$transaction(
        async (transaction) => {
          const addressCount = await transaction.address.count({
            where: { userId },
          });
          const isDefault =
            addressCount === 0 || normalized.isDefault;

          if (isDefault) {
            await transaction.address.updateMany({
              where: { userId },
              data: { isDefault: false },
            });
          }

          return transaction.address.create({
            data: {
              ...normalized,
              isDefault,
              userId,
            },
            select: addressSummarySelect,
          });
        },
        {
          maxWait: 5_000,
          timeout: 10_000,
        },
      ),
    );
  }

  async function updateAddress(
    addressId: string,
    input: UpdateAddressInput,
  ): Promise<AddressSummary> {
    const userId = await requireCurrentUserId();
    const normalizedAddressId = normalizeAddressId(addressId);
    const normalized = normalizeUpdateInput(input);

    return executeWithRetry(() =>
      prisma.$transaction(
        async (transaction) => {
          const current = await transaction.address.findFirst({
            where: {
              id: normalizedAddressId,
              userId,
            },
            select: {
              id: true,
              isDefault: true,
            },
          });

          if (!current) {
            throw new AddressError("ADDRESS_NOT_FOUND");
          }

          if (
            normalized.isDefault === false &&
            current.isDefault
          ) {
            const addressCount = await transaction.address.count({
              where: { userId },
            });

            if (addressCount <= 1) {
              throw new AddressError(
                "LAST_ADDRESS_MUST_BE_DEFAULT",
              );
            }
          }

          if (normalized.isDefault === true) {
            await transaction.address.updateMany({
              where: {
                userId,
                id: { not: normalizedAddressId },
              },
              data: { isDefault: false },
            });
          }

          if (Object.keys(normalized).length > 0) {
            const updated = await transaction.address.updateMany({
              where: {
                id: normalizedAddressId,
                userId,
              },
              data: normalized,
            });

            if (updated.count !== 1) {
              throw new AddressError("ADDRESS_NOT_FOUND");
            }
          }

          const address = await transaction.address.findFirst({
            where: {
              id: normalizedAddressId,
              userId,
            },
            select: addressSummarySelect,
          });

          if (!address) {
            throw new AddressError("ADDRESS_NOT_FOUND");
          }

          return address;
        },
        {
          maxWait: 5_000,
          timeout: 10_000,
        },
      ),
    );
  }

  async function setDefaultAddress(
    addressId: string,
  ): Promise<AddressSummary> {
    const userId = await requireCurrentUserId();
    const normalizedAddressId = normalizeAddressId(addressId);

    return executeWithRetry(() =>
      prisma.$transaction(
        async (transaction) => {
          const owned = await transaction.address.findFirst({
            where: {
              id: normalizedAddressId,
              userId,
            },
            select: { id: true },
          });

          if (!owned) {
            throw new AddressError("ADDRESS_NOT_FOUND");
          }

          await transaction.address.updateMany({
            where: {
              userId,
              id: { not: normalizedAddressId },
            },
            data: { isDefault: false },
          });
          const updated = await transaction.address.updateMany({
            where: {
              id: normalizedAddressId,
              userId,
            },
            data: { isDefault: true },
          });

          if (updated.count !== 1) {
            throw new AddressError("ADDRESS_NOT_FOUND");
          }

          const address = await transaction.address.findFirst({
            where: {
              id: normalizedAddressId,
              userId,
            },
            select: addressSummarySelect,
          });

          if (!address) {
            throw new AddressError("ADDRESS_NOT_FOUND");
          }

          return address;
        },
        {
          maxWait: 5_000,
          timeout: 10_000,
        },
      ),
    );
  }

  async function deleteAddress(addressId: string): Promise<void> {
    const userId = await requireCurrentUserId();
    const normalizedAddressId = normalizeAddressId(addressId);

    await executeWithRetry(() =>
      prisma.$transaction(
        async (transaction) => {
          const current = await transaction.address.findFirst({
            where: {
              id: normalizedAddressId,
              userId,
            },
            select: {
              id: true,
              isDefault: true,
            },
          });

          if (!current) {
            throw new AddressError("ADDRESS_NOT_FOUND");
          }

          const removed = await transaction.address.deleteMany({
            where: {
              id: normalizedAddressId,
              userId,
            },
          });

          if (removed.count !== 1) {
            throw new AddressError("ADDRESS_NOT_FOUND");
          }

          if (!current.isDefault) {
            return;
          }

          const nextDefault = await transaction.address.findFirst({
            where: { userId },
            select: { id: true },
            orderBy: [
              { createdAt: "desc" },
              { id: "desc" },
            ],
          });

          if (nextDefault) {
            await transaction.address.update({
              where: { id: nextDefault.id },
              data: { isDefault: true },
            });
          }
        },
        {
          maxWait: 5_000,
          timeout: 10_000,
        },
      ),
    );
  }

  return {
    getAddresses,
    getAddress,
    createAddress,
    updateAddress,
    setDefaultAddress,
    deleteAddress,
  };
}

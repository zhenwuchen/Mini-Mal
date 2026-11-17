import { randomUUID } from "node:crypto";

import {
  Prisma,
  type PrismaClient,
  type Product,
} from "@prisma/client";

import {
  INITIAL_ORDER_STATUS,
  ORDER_CURRENCY,
} from "@/lib/order-status";
import { calculateOrderExpiresAt } from "@/lib/order-policy";

export type OrderErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_CHECKOUT_KEY"
  | "ADDRESS_INVALID"
  | "CART_EMPTY"
  | "INVALID_CART_ITEM"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "INVALID_PRODUCT_PRICE"
  | "INSUFFICIENT_STOCK"
  | "INVALID_ORDER_TOTAL"
  | "ORDER_CONFLICT"
  | "ORDER_BUSY"
  | "ORDER_CREATE_FAILED";

const orderErrorMessages: Record<OrderErrorCode, string> = {
  UNAUTHENTICATED: "请先登录后再创建订单",
  INVALID_CHECKOUT_KEY: "结算请求标识无效，请刷新页面后重试",
  ADDRESS_INVALID: "收货地址无效",
  CART_EMPTY: "购物车为空，无法创建订单",
  INVALID_CART_ITEM: "购物车商品数量无效",
  PRODUCT_NOT_FOUND: "商品不存在",
  PRODUCT_INACTIVE: "商品已下架",
  INVALID_PRODUCT_PRICE: "商品价格无效",
  INSUFFICIENT_STOCK: "商品库存不足",
  INVALID_ORDER_TOTAL: "订单金额无效",
  ORDER_CONFLICT: "订单创建冲突，请稍后重试",
  ORDER_BUSY: "订单创建繁忙，请稍后重试",
  ORDER_CREATE_FAILED: "订单创建失败，请稍后重试",
};

export class OrderError extends Error {
  readonly code: OrderErrorCode;

  constructor(code: OrderErrorCode) {
    super(orderErrorMessages[code]);
    this.name = "OrderError";
    this.code = code;
  }
}

export type CreateOrderInput = {
  addressId: string;
  checkoutKey: string;
};

const orderSummarySelect = {
  id: true,
  orderNumber: true,
  itemsAmount: true,
  shippingAmount: true,
  discountAmount: true,
  totalAmount: true,
  currency: true,
  status: true,
  expiresAt: true,
  paidAt: true,
  cancelledAt: true,
  completedAt: true,
  shippingAddressId: true,
  shippingName: true,
  shippingPhone: true,
  shippingAddress: true,
  shippingRecipientName: true,
  shippingProvince: true,
  shippingCity: true,
  shippingDistrict: true,
  shippingAddressLine: true,
  shippingPostalCode: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      productId: true,
      productName: true,
      productSlug: true,
      productImageUrl: true,
      unitPrice: true,
      quantity: true,
      subtotal: true,
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  },
} satisfies Prisma.OrderSelect;

export type OrderSummary = Prisma.OrderGetPayload<{
  select: typeof orderSummarySelect;
}>;

export type OrderService = {
  createOrder(input: CreateOrderInput): Promise<OrderSummary>;
};

type OrderServiceDependencies = {
  prisma: PrismaClient;
  getCurrentUserId: () => Promise<string | null>;
  now?: () => Date;
};

type NormalizedOrderInput = {
  addressId: string;
  checkoutKey: string;
};

type CartLine = {
  productId: string;
  quantity: number;
};

type ValidatedOrderLine = {
  product: Product;
  quantity: number;
  subtotal: number;
};

const MAX_WRITE_ATTEMPTS = 5;

class RetryableOrderWriteError extends Error {}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function isRetryableWriteError(error: unknown): boolean {
  if (
    error instanceof RetryableOrderWriteError ||
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
      error.message.includes("Transaction already closed") ||
      error.message.includes("Transaction is not found"))
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function normalizeOrderInput(
  input: CreateOrderInput,
): NormalizedOrderInput {
  const candidate =
    input && typeof input === "object"
      ? (input as unknown as Record<string, unknown>)
      : {};
  const checkoutKey =
    typeof candidate.checkoutKey === "string"
      ? candidate.checkoutKey.trim()
      : "";

  if (
    !checkoutKey ||
    checkoutKey.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(checkoutKey)
  ) {
    throw new OrderError("INVALID_CHECKOUT_KEY");
  }

  const addressId =
    typeof candidate.addressId === "string"
      ? candidate.addressId.trim()
      : "";

  if (
    !addressId ||
    addressId.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(addressId)
  ) {
    throw new OrderError("ADDRESS_INVALID");
  }

  return { addressId, checkoutKey };
}

function generateOrderNumber(): string {
  const datePart = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
  const randomPart = randomUUID().replace(/-/g, "").slice(0, 16);

  return `ORD${datePart}${randomPart.toUpperCase()}`;
}

function formatShippingAddress(address: {
  province: string;
  city: string;
  district: string;
  addressLine: string;
}) {
  const province = address.province.trim();
  const city = address.city.trim();
  const district = address.district.trim();
  const addressLine = address.addressLine.trim();

  return [
    province,
    city !== province ? city : "",
    district,
    addressLine,
  ].join("");
}

async function findOrderByCheckoutKey(
  client: Pick<Prisma.TransactionClient, "order">,
  userId: string,
  checkoutKey: string,
): Promise<OrderSummary | null> {
  return client.order.findUnique({
    where: {
      userId_checkoutKey: {
        userId,
        checkoutKey,
      },
    },
    select: orderSummarySelect,
  });
}

async function decrementStock(
  transaction: Prisma.TransactionClient,
  line: ValidatedOrderLine,
) {
  const updated = await transaction.product.updateMany({
    where: {
      id: line.product.id,
      isActive: true,
      price: line.product.price,
      stock: { gte: line.quantity },
    },
    data: {
      stock: { decrement: line.quantity },
    },
  });

  if (updated.count === 1) {
    return;
  }

  const current = await transaction.product.findUnique({
    where: { id: line.product.id },
    select: {
      stock: true,
      price: true,
      isActive: true,
    },
  });

  if (!current) {
    throw new OrderError("PRODUCT_NOT_FOUND");
  }

  if (!current.isActive) {
    throw new OrderError("PRODUCT_INACTIVE");
  }

  if (!Number.isSafeInteger(current.price) || current.price < 0) {
    throw new OrderError("INVALID_PRODUCT_PRICE");
  }

  if (current.stock < line.quantity) {
    throw new OrderError("INSUFFICIENT_STOCK");
  }

  throw new RetryableOrderWriteError(
    "Product changed during checkout",
  );
}

function validateCartLines(
  lines: CartLine[],
  products: Product[],
): {
  lines: ValidatedOrderLine[];
  itemsAmount: number;
} {
  const productsById = new Map(
    products.map((product) => [product.id, product]),
  );
  const validatedLines: ValidatedOrderLine[] = [];
  let itemsAmount = 0;

  for (const line of lines) {
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity < 1
    ) {
      throw new OrderError("INVALID_CART_ITEM");
    }

    const product = productsById.get(line.productId);

    if (!product) {
      throw new OrderError("PRODUCT_NOT_FOUND");
    }

    if (!product.isActive) {
      throw new OrderError("PRODUCT_INACTIVE");
    }

    if (
      !Number.isSafeInteger(product.price) ||
      product.price < 0
    ) {
      throw new OrderError("INVALID_PRODUCT_PRICE");
    }

    if (product.stock < line.quantity) {
      throw new OrderError("INSUFFICIENT_STOCK");
    }

    const subtotal = product.price * line.quantity;

    if (!Number.isSafeInteger(subtotal) || subtotal < 0) {
      throw new OrderError("INVALID_ORDER_TOTAL");
    }

    const nextItemsAmount = itemsAmount + subtotal;

    if (
      !Number.isSafeInteger(nextItemsAmount) ||
      nextItemsAmount < 0
    ) {
      throw new OrderError("INVALID_ORDER_TOTAL");
    }

    itemsAmount = nextItemsAmount;
    validatedLines.push({
      product,
      quantity: line.quantity,
      subtotal,
    });
  }

  return {
    lines: validatedLines,
    itemsAmount,
  };
}

export function createOrderService({
  prisma,
  getCurrentUserId,
  now = () => new Date(),
}: OrderServiceDependencies): OrderService {
  async function requireCurrentUserId(): Promise<string> {
    const userId = await getCurrentUserId();

    if (!userId) {
      throw new OrderError("UNAUTHENTICATED");
    }

    return userId;
  }

  async function createOrder(
    input: CreateOrderInput,
  ): Promise<OrderSummary> {
    const userId = await requireCurrentUserId();
    const normalized = normalizeOrderInput(input);
    const existing = await findOrderByCheckoutKey(
      prisma,
      userId,
      normalized.checkoutKey,
    );

    if (existing) {
      return existing;
    }

    for (
      let attempt = 1;
      attempt <= MAX_WRITE_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await prisma.$transaction(
          async (transaction) => {
            const orderAlreadyCreated =
              await findOrderByCheckoutKey(
                transaction,
                userId,
                normalized.checkoutKey,
              );

            if (orderAlreadyCreated) {
              return orderAlreadyCreated;
            }

            const cart = await transaction.cart.findUnique({
              where: { userId },
              select: {
                id: true,
                items: {
                  select: {
                    productId: true,
                    quantity: true,
                  },
                  orderBy: [
                    { createdAt: "asc" },
                    { id: "asc" },
                  ],
                },
              },
            });

            if (!cart || cart.items.length === 0) {
              throw new OrderError("CART_EMPTY");
            }

            const address = await transaction.address.findFirst({
              where: {
                id: normalized.addressId,
                userId,
              },
            });

            if (
              !address ||
              !address.recipientName.trim() ||
              !address.phone.trim() ||
              !address.province.trim() ||
              !address.city.trim() ||
              !address.district.trim() ||
              !address.addressLine.trim()
            ) {
              throw new OrderError("ADDRESS_INVALID");
            }

            const cartLines: CartLine[] = cart.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
            }));
            const products = await transaction.product.findMany({
              where: {
                id: {
                  in: cartLines.map((line) => line.productId),
                },
              },
            });
            const validated = validateCartLines(
              cartLines,
              products,
            );

            for (const line of validated.lines) {
              await decrementStock(transaction, line);
            }

            const shippingAmount = 0;
            const discountAmount = 0;
            const totalAmount =
              validated.itemsAmount +
              shippingAmount -
              discountAmount;

            if (
              !Number.isSafeInteger(totalAmount) ||
              totalAmount < 0
            ) {
              throw new OrderError("INVALID_ORDER_TOTAL");
            }

            const createdAt = now();
            const order = await transaction.order.create({
              data: {
                orderNumber: generateOrderNumber(),
                userId,
                checkoutKey: normalized.checkoutKey,
                itemsAmount: validated.itemsAmount,
                shippingAmount,
                discountAmount,
                totalAmount,
                currency: ORDER_CURRENCY,
                status: INITIAL_ORDER_STATUS,
                createdAt,
                expiresAt: calculateOrderExpiresAt(createdAt),
                shippingAddressId: address.id,
                shippingName: address.recipientName,
                shippingPhone: address.phone,
                shippingAddress: formatShippingAddress(address),
                shippingRecipientName: address.recipientName,
                shippingProvince: address.province,
                shippingCity: address.city,
                shippingDistrict: address.district,
                shippingAddressLine: address.addressLine,
                shippingPostalCode: address.postalCode,
              },
              select: { id: true },
            });

            await transaction.orderItem.createMany({
              data: validated.lines.map((line) => ({
                orderId: order.id,
                productId: line.product.id,
                productName: line.product.name,
                productSlug: line.product.slug,
                productImageUrl: line.product.imageUrl,
                unitPrice: line.product.price,
                quantity: line.quantity,
                subtotal: line.subtotal,
              })),
            });

            const removed = await transaction.cartItem.deleteMany({
              where: { cartId: cart.id },
            });

            if (removed.count !== cart.items.length) {
              throw new RetryableOrderWriteError(
                "Cart changed during checkout",
              );
            }

            const created = await findOrderByCheckoutKey(
              transaction,
              userId,
              normalized.checkoutKey,
            );

            if (!created) {
              throw new RetryableOrderWriteError(
                "Created order cannot be read",
              );
            }

            return created;
          },
          {
            maxWait: 5_000,
            timeout: 10_000,
          },
        );
      } catch (error) {
        if (isPrismaErrorCode(error, "P2002")) {
          const idempotentOrder = await findOrderByCheckoutKey(
            prisma,
            userId,
            normalized.checkoutKey,
          );

          if (idempotentOrder) {
            return idempotentOrder;
          }

          if (attempt < MAX_WRITE_ATTEMPTS) {
            await wait(attempt * 25);
            continue;
          }

          throw new OrderError("ORDER_CONFLICT");
        }

        if (isRetryableWriteError(error)) {
          if (attempt < MAX_WRITE_ATTEMPTS) {
            await wait(attempt * 25);
            continue;
          }

          const idempotentOrder = await findOrderByCheckoutKey(
            prisma,
            userId,
            normalized.checkoutKey,
          );

          if (idempotentOrder) {
            return idempotentOrder;
          }

          throw new OrderError("ORDER_BUSY");
        }

        if (error instanceof OrderError) {
          throw error;
        }

        throw new OrderError("ORDER_CREATE_FAILED");
      }
    }

    throw new OrderError("ORDER_BUSY");
  }

  return { createOrder };
}

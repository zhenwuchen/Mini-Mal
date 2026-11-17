import {
  Prisma,
  type CartItem,
  type PrismaClient,
  type Product,
} from "@prisma/client";

export type CartErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_QUANTITY"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK"
  | "CART_ITEM_NOT_FOUND"
  | "CART_BUSY";

const cartErrorMessages: Record<CartErrorCode, string> = {
  UNAUTHENTICATED: "请先登录后再操作购物车",
  INVALID_QUANTITY: "商品数量必须为正整数",
  PRODUCT_NOT_FOUND: "商品不存在",
  PRODUCT_INACTIVE: "商品已下架",
  OUT_OF_STOCK: "商品暂时缺货",
  INSUFFICIENT_STOCK: "商品库存不足",
  CART_ITEM_NOT_FOUND: "购物车商品不存在",
  CART_BUSY: "购物车操作繁忙，请稍后重试",
};

export class CartError extends Error {
  readonly code: CartErrorCode;

  constructor(code: CartErrorCode) {
    super(cartErrorMessages[code]);
    this.name = "CartError";
    this.code = code;
  }
}

export type CartItemSummary = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  price: number;
  quantity: number;
  subtotal: number;
  stock: number;
  isActive: boolean;
};

export type CartSummary = {
  id: string;
  items: CartItemSummary[];
  totalQuantity: number;
  totalAmount: number;
};

export type AddCartItemInput = {
  productId: string;
  quantity: number;
};

export type UpdateCartItemQuantityInput = {
  cartItemId: string;
  quantity: number;
};

export type CartService = {
  getCart(): Promise<CartSummary>;
  addCartItem(input: AddCartItemInput): Promise<CartSummary>;
  updateCartItemQuantity(
    input: UpdateCartItemQuantityInput,
  ): Promise<CartSummary>;
  removeCartItem(cartItemId: string): Promise<CartSummary>;
  clearCart(): Promise<CartSummary>;
};

type CartServiceDependencies = {
  prisma: PrismaClient;
  getCurrentUserId: () => Promise<string | null>;
};

type CartItemWithProduct = CartItem & {
  product: Product;
};

const MAX_WRITE_ATTEMPTS = 5;
const cartWriteQueues = new Map<string, Promise<void>>();

class RetryableCartWriteError extends Error {}

function validateQuantity(quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new CartError("INVALID_QUANTITY");
  }

  return quantity;
}

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function isRetryableWriteError(error: unknown): boolean {
  if (
    error instanceof RetryableCartWriteError ||
    isPrismaErrorCode(error, "P2002") ||
    isPrismaErrorCode(error, "P2034")
  ) {
    return true;
  }

  return (
    error instanceof Error &&
    (error.message.includes("database is locked") ||
      error.message.includes("Transaction API error"))
  );
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
        throw new CartError("CART_BUSY");
      }

      await new Promise((resolve) => {
        setTimeout(resolve, attempt * 20);
      });
    }
  }

  throw new CartError("CART_BUSY");
}

async function withCartWriteLock<T>(
  userId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = cartWriteQueues.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const queueTail = current.then(
    () => undefined,
    () => undefined,
  );

  cartWriteQueues.set(userId, queueTail);

  try {
    return await current;
  } finally {
    if (cartWriteQueues.get(userId) === queueTail) {
      cartWriteQueues.delete(userId);
    }
  }
}

function toCartSummary(
  cart: {
    id: string;
    items: CartItemWithProduct[];
  },
): CartSummary {
  const items = cart.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    name: item.product.name,
    slug: item.product.slug,
    imageUrl: item.product.imageUrl,
    price: item.product.price,
    quantity: item.quantity,
    subtotal: item.product.price * item.quantity,
    stock: item.product.stock,
    isActive: item.product.isActive,
  }));

  return {
    id: cart.id,
    items,
    totalQuantity: items.reduce((total, item) => total + item.quantity, 0),
    totalAmount: items.reduce((total, item) => total + item.subtotal, 0),
  };
}

export function createCartService({
  prisma,
  getCurrentUserId,
}: CartServiceDependencies): CartService {
  async function requireCurrentUserId(): Promise<string> {
    const userId = await getCurrentUserId();

    if (!userId) {
      throw new CartError("UNAUTHENTICATED");
    }

    return userId;
  }

  async function ensureCart(userId: string) {
    return executeWithRetry(async () => {
      try {
        return await prisma.cart.upsert({
          where: { userId },
          update: {},
          create: { userId },
        });
      } catch (error) {
        if (isPrismaErrorCode(error, "P2002")) {
          const existingCart = await prisma.cart.findUnique({
            where: { userId },
          });

          if (existingCart) {
            return existingCart;
          }
        }

        throw error;
      }
    });
  }

  async function queryCart(userId: string): Promise<CartSummary> {
    const cart = await prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!cart) {
      throw new Error("购物车创建失败");
    }

    return toCartSummary(cart);
  }

  async function getOwnedCart(userId: string) {
    return prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  async function getCart(): Promise<CartSummary> {
    const userId = await requireCurrentUserId();
    await ensureCart(userId);
    return queryCart(userId);
  }

  async function addCartItem(
    input: AddCartItemInput,
  ): Promise<CartSummary> {
    const userId = await requireCurrentUserId();
    const quantity = validateQuantity(input.quantity);
    const cart = await ensureCart(userId);

    await withCartWriteLock(userId, async () => {
      await executeWithRetry(async () => {
        await prisma.$transaction(async (transaction) => {
          const product = await transaction.product.findUnique({
            where: { id: input.productId },
            select: {
              id: true,
              stock: true,
              isActive: true,
            },
          });

          if (!product) {
            throw new CartError("PRODUCT_NOT_FOUND");
          }

          if (!product.isActive) {
            throw new CartError("PRODUCT_INACTIVE");
          }

          if (product.stock <= 0) {
            throw new CartError("OUT_OF_STOCK");
          }

          const existingItem = await transaction.cartItem.findUnique({
            where: {
              cartId_productId: {
                cartId: cart.id,
                productId: product.id,
              },
            },
          });

          if (!existingItem) {
            if (quantity > product.stock) {
              throw new CartError("INSUFFICIENT_STOCK");
            }

            await transaction.cartItem.create({
              data: {
                cartId: cart.id,
                productId: product.id,
                quantity,
              },
            });
            return;
          }

          const nextQuantity = existingItem.quantity + quantity;

          if (nextQuantity > product.stock) {
            throw new CartError("INSUFFICIENT_STOCK");
          }

          const updated = await transaction.cartItem.updateMany({
            where: {
              id: existingItem.id,
              cartId: cart.id,
              quantity: existingItem.quantity,
            },
            data: { quantity: nextQuantity },
          });

          if (updated.count !== 1) {
            throw new RetryableCartWriteError(
              "Cart item changed during update",
            );
          }
        });
      });
    });

    return queryCart(userId);
  }

  async function updateCartItemQuantity(
    input: UpdateCartItemQuantityInput,
  ): Promise<CartSummary> {
    const userId = await requireCurrentUserId();
    const quantity = validateQuantity(input.quantity);
    const cart = await getOwnedCart(userId);

    if (!cart) {
      throw new CartError("CART_ITEM_NOT_FOUND");
    }

    await withCartWriteLock(userId, async () => {
      await executeWithRetry(async () => {
        await prisma.$transaction(async (transaction) => {
          const item = await transaction.cartItem.findFirst({
            where: {
              id: input.cartItemId,
              cartId: cart.id,
            },
            include: { product: true },
          });

          if (!item) {
            throw new CartError("CART_ITEM_NOT_FOUND");
          }

          if (quantity > item.quantity) {
            if (!item.product.isActive) {
              throw new CartError("PRODUCT_INACTIVE");
            }

            if (item.product.stock <= 0) {
              throw new CartError("OUT_OF_STOCK");
            }
          }

          if (quantity > item.product.stock) {
            throw new CartError("INSUFFICIENT_STOCK");
          }

          const updated = await transaction.cartItem.updateMany({
            where: {
              id: item.id,
              cartId: cart.id,
            },
            data: { quantity },
          });

          if (updated.count !== 1) {
            throw new RetryableCartWriteError(
              "Cart item disappeared during update",
            );
          }
        });
      });
    });

    return queryCart(userId);
  }

  async function removeCartItem(
    cartItemId: string,
  ): Promise<CartSummary> {
    const userId = await requireCurrentUserId();
    const cart = await getOwnedCart(userId);

    if (!cart) {
      throw new CartError("CART_ITEM_NOT_FOUND");
    }

    const removed = await prisma.cartItem.deleteMany({
      where: {
        id: cartItemId,
        cartId: cart.id,
      },
    });

    if (removed.count !== 1) {
      throw new CartError("CART_ITEM_NOT_FOUND");
    }

    return queryCart(userId);
  }

  async function clearCart(): Promise<CartSummary> {
    const userId = await requireCurrentUserId();
    const cart = await ensureCart(userId);

    await withCartWriteLock(userId, async () => {
      await executeWithRetry(() =>
        prisma.cartItem.deleteMany({
          where: { cartId: cart.id },
        }),
      );
    });

    return queryCart(userId);
  }

  return {
    getCart,
    addCartItem,
    updateCartItemQuantity,
    removeCartItem,
    clearCart,
  };
}

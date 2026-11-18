import type { Prisma, PrismaClient } from "@prisma/client";

import {
  buildOrderListOrderBy,
  buildOrderListWhere,
  normalizeOrderNumber,
  normalizeOrderPagination,
  normalizeOrderStatusFilter,
  toOrderPaymentView,
  type OrderPaymentView,
} from "@/lib/order-query-core";
import type { OrderStatus } from "@/lib/order-status";

export type OrderQueryErrorCode =
  | "UNAUTHENTICATED"
  | "ORDER_NOT_FOUND"
  | "ORDER_QUERY_FAILED";

const orderQueryErrorMessages: Record<
  OrderQueryErrorCode,
  string
> = {
  UNAUTHENTICATED: "请先登录后查看订单",
  ORDER_NOT_FOUND: "订单不存在",
  ORDER_QUERY_FAILED: "订单暂时无法加载，请稍后重试",
};

export class OrderQueryError extends Error {
  readonly code: OrderQueryErrorCode;

  constructor(code: OrderQueryErrorCode) {
    super(orderQueryErrorMessages[code]);
    this.name = "OrderQueryError";
    this.code = code;
  }
}

export type GetOrdersInput = {
  page?: number;
  pageSize?: number;
  status?: string;
};

export type OrderSnapshotItem = {
  productName: string;
  productSlug: string | null;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  subtotal: number;
};

export type OrderListItem = {
  orderNumber: string;
  status: string;
  currency: string;
  itemsAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  createdAt: Date;
  totalQuantity: number;
  itemCount: number;
  items: OrderSnapshotItem[];
};

export type OrderListResult = {
  orders: OrderListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type OrderShippingSnapshot = {
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;
};

export type OrderDetail = Omit<
  OrderListItem,
  "totalQuantity" | "itemCount" | "items"
> & {
  expiresAt: Date | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  items: OrderSnapshotItem[];
  shipping: OrderShippingSnapshot;
  payments: OrderPaymentView[];
};

export type OrderQueryService = {
  getOrders(input?: GetOrdersInput): Promise<OrderListResult>;
  getOrderDetail(orderNumber: string): Promise<OrderDetail>;
};

type OrderQueryServiceDependencies = {
  prisma: PrismaClient;
  getCurrentUserId: () => Promise<string | null>;
};

const orderItemSnapshotSelect = {
  productName: true,
  productSlug: true,
  productImageUrl: true,
  unitPrice: true,
  quantity: true,
  subtotal: true,
} satisfies Prisma.OrderItemSelect;

const orderListSelect = {
  id: true,
  orderNumber: true,
  status: true,
  currency: true,
  itemsAmount: true,
  shippingAmount: true,
  discountAmount: true,
  totalAmount: true,
  createdAt: true,
  items: {
    select: orderItemSnapshotSelect,
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: 3,
  },
} satisfies Prisma.OrderSelect;

const orderDetailSelect = {
  orderNumber: true,
  status: true,
  currency: true,
  itemsAmount: true,
  shippingAmount: true,
  discountAmount: true,
  totalAmount: true,
  createdAt: true,
  expiresAt: true,
  paidAt: true,
  cancelledAt: true,
  shippingName: true,
  shippingPhone: true,
  shippingAddress: true,
  shippingRecipientName: true,
  shippingProvince: true,
  shippingCity: true,
  shippingDistrict: true,
  shippingAddressLine: true,
  shippingPostalCode: true,
  items: {
    select: orderItemSnapshotSelect,
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  },
  payments: {
    select: {
      id: true,
      status: true,
      amount: true,
      currency: true,
      failureCode: true,
      failureReason: true,
      createdAt: true,
      paidAt: true,
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
  },
} satisfies Prisma.OrderSelect;

function cleanText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function cleanNullableText(
  value: string | null | undefined,
): string | null {
  return cleanText(value) || null;
}

function toOrderSnapshotItem(
  item: OrderSnapshotItem,
): OrderSnapshotItem {
  return {
    productName: item.productName,
    productSlug: item.productSlug,
    productImageUrl: item.productImageUrl,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.subtotal,
  };
}

export function createOrderQueryService({
  prisma,
  getCurrentUserId,
}: OrderQueryServiceDependencies): OrderQueryService {
  async function requireCurrentUserId(): Promise<string> {
    const userId = await getCurrentUserId();

    if (!userId) {
      throw new OrderQueryError("UNAUTHENTICATED");
    }

    return userId;
  }

  async function getOrders(
    input: GetOrdersInput = {},
  ): Promise<OrderListResult> {
    const userId = await requireCurrentUserId();
    const { page, pageSize } = normalizeOrderPagination(input);
    const status: OrderStatus | undefined =
      normalizeOrderStatusFilter(input.status);
    const where = buildOrderListWhere(userId, status);

    try {
      const [totalCount, orders] = await prisma.$transaction([
        prisma.order.count({ where }),
        prisma.order.findMany({
          where,
          select: orderListSelect,
          orderBy: buildOrderListOrderBy(),
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);
      const quantityRows =
        orders.length === 0
          ? []
          : await prisma.orderItem.groupBy({
              by: ["orderId"],
              where: {
                orderId: {
                  in: orders.map((order) => order.id),
                },
              },
              _sum: { quantity: true },
              _count: { _all: true },
            });
      const quantityByOrderId = new Map(
        quantityRows.map((row) => [
          row.orderId,
          {
            totalQuantity: row._sum.quantity ?? 0,
            itemCount: row._count._all,
          },
        ]),
      );

      return {
        orders: orders.map((order) => {
          const totals = quantityByOrderId.get(order.id);

          return {
            orderNumber: order.orderNumber,
            status: order.status,
            currency: order.currency,
            itemsAmount: order.itemsAmount,
            shippingAmount: order.shippingAmount,
            discountAmount: order.discountAmount,
            totalAmount: order.totalAmount,
            createdAt: order.createdAt,
            totalQuantity: totals?.totalQuantity ?? 0,
            itemCount: totals?.itemCount ?? order.items.length,
            items: order.items.map(toOrderSnapshotItem),
          };
        }),
        totalCount,
        page,
        pageSize,
        totalPages:
          totalCount === 0
            ? 0
            : Math.ceil(totalCount / pageSize),
      };
    } catch (error) {
      if (error instanceof OrderQueryError) throw error;
      throw new OrderQueryError("ORDER_QUERY_FAILED");
    }
  }

  async function getOrderDetail(
    orderNumber: string,
  ): Promise<OrderDetail> {
    const userId = await requireCurrentUserId();
    const normalizedOrderNumber = normalizeOrderNumber(orderNumber);

    if (!normalizedOrderNumber) {
      throw new OrderQueryError("ORDER_NOT_FOUND");
    }

    try {
      const order = await prisma.order.findFirst({
        where: {
          orderNumber: normalizedOrderNumber,
          userId,
        },
        select: orderDetailSelect,
      });

      if (!order) {
        throw new OrderQueryError("ORDER_NOT_FOUND");
      }

      return {
        orderNumber: order.orderNumber,
        status: order.status,
        currency: order.currency,
        itemsAmount: order.itemsAmount,
        shippingAmount: order.shippingAmount,
        discountAmount: order.discountAmount,
        totalAmount: order.totalAmount,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        paidAt: order.paidAt,
        cancelledAt: order.cancelledAt,
        items: order.items.map(toOrderSnapshotItem),
        payments: order.payments.map(toOrderPaymentView),
        shipping: {
          recipientName:
            cleanText(order.shippingRecipientName) ||
            cleanText(order.shippingName),
          phone: cleanText(order.shippingPhone),
          province: cleanText(order.shippingProvince),
          city: cleanText(order.shippingCity),
          district: cleanText(order.shippingDistrict),
          addressLine:
            cleanText(order.shippingAddressLine) ||
            cleanText(order.shippingAddress),
          postalCode: cleanNullableText(
            order.shippingPostalCode,
          ),
        },
      };
    } catch (error) {
      if (error instanceof OrderQueryError) throw error;
      throw new OrderQueryError("ORDER_QUERY_FAILED");
    }
  }

  return {
    getOrders,
    getOrderDetail,
  };
}

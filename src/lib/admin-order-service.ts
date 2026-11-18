import {
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import type {
  AdminOrderSearch,
  AdminPaymentStatusFilter,
} from "@/lib/admin-order";
import type { OrderPaymentView } from "@/lib/order-query-core";
import { toOrderPaymentView } from "@/lib/order-query-core";

export type AdminDashboardStats = {
  productTotal: number;
  activeProductCount: number;
  inactiveProductCount: number;
  categoryTotal: number;
  orderTotal: number;
  pendingPaymentCount: number;
  paidCount: number;
  cancelledCount: number;
};

export type AdminOrderListItem = {
  orderNumber: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  totalAmount: number;
  currency: string;
  status: string;
  paymentStatus: AdminPaymentStatusFilter;
  createdAt: Date;
  paidAt: Date | null;
};

export type AdminOrderListResult = {
  orders: AdminOrderListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminOrderDetail = {
  orderNumber: string;
  user: {
    id: string;
    name: string | null;
    email: string;
  };
  itemsAmount: number;
  shippingAmount: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
  items: Array<{
    productName: string;
    productSlug: string | null;
    productImageUrl: string | null;
    unitPrice: number;
    quantity: number;
    subtotal: number;
  }>;
  payments: OrderPaymentView[];
  shipping: {
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    addressLine: string;
    postalCode: string | null;
  };
};

export type AdminOrderService = {
  getDashboardStats(): Promise<AdminDashboardStats>;
  listOrders(search: AdminOrderSearch): Promise<AdminOrderListResult>;
  getOrderDetail(orderNumber: string): Promise<AdminOrderDetail | null>;
};

type AdminOrderServiceDependencies = {
  prisma: PrismaClient;
};

const PAGE_SIZE = 10;
const ORDER_NUMBER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const orderListSelect = {
  orderNumber: true,
  totalAmount: true,
  currency: true,
  status: true,
  createdAt: true,
  paidAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  payments: {
    select: {
      status: true,
      createdAt: true,
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: 8,
  },
} satisfies Prisma.OrderSelect;

const orderDetailSelect = {
  orderNumber: true,
  itemsAmount: true,
  shippingAmount: true,
  discountAmount: true,
  totalAmount: true,
  currency: true,
  status: true,
  createdAt: true,
  expiresAt: true,
  paidAt: true,
  cancelledAt: true,
  completedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  items: {
    select: {
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
  shippingName: true,
  shippingPhone: true,
  shippingAddress: true,
  shippingRecipientName: true,
  shippingProvince: true,
  shippingCity: true,
  shippingDistrict: true,
  shippingAddressLine: true,
  shippingPostalCode: true,
} satisfies Prisma.OrderSelect;

function toOverallPaymentStatus(
  statuses: string[],
): AdminPaymentStatusFilter {
  if (statuses.includes("SUCCEEDED")) return "SUCCEEDED";
  if (statuses.includes("PENDING")) return "PENDING";
  if (statuses.includes("REFUNDED")) return "REFUNDED";
  if (statuses.includes("FAILED")) return "FAILED";
  if (statuses.includes("CANCELLED")) return "CANCELLED";
  return "UNPAID";
}

function paymentStatusWhere(
  status: AdminPaymentStatusFilter | undefined,
): Prisma.OrderWhereInput {
  if (!status) return {};
  if (status === "UNPAID") {
    return { payments: { none: {} } };
  }

  if (status === "SUCCEEDED") {
    return { payments: { some: { status } } };
  }

  if (status === "REFUNDED") {
    return {
      payments: { some: { status } },
      NOT: { payments: { some: { status: "SUCCEEDED" } } },
    };
  }

  if (status === "PENDING") {
    return {
      payments: { some: { status } },
      NOT: {
        payments: {
          some: { status: { in: ["SUCCEEDED", "REFUNDED"] } },
        },
      },
    };
  }

  if (status === "FAILED") {
    return {
      payments: { some: { status } },
      NOT: {
        payments: {
          some: {
            status: {
              in: ["SUCCEEDED", "PENDING", "REFUNDED"],
            },
          },
        },
      },
    };
  }

  return {
    payments: { some: { status } },
    NOT: {
      payments: {
        some: {
          status: {
            in: ["SUCCEEDED", "PENDING", "FAILED", "REFUNDED"],
          },
        },
      },
    },
  };
}

function nullableText(value: string | null | undefined) {
  return value?.trim() || null;
}

export function createAdminOrderService({
  prisma,
}: AdminOrderServiceDependencies): AdminOrderService {
  async function getDashboardStats(): Promise<AdminDashboardStats> {
    const [
      productTotal,
      activeProductCount,
      inactiveProductCount,
      categoryTotal,
      orderTotal,
      pendingPaymentCount,
      paidCount,
      cancelledCount,
    ] = await prisma.$transaction([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({ where: { isActive: false } }),
      prisma.category.count(),
      prisma.order.count(),
      prisma.order.count({
        where: { status: "PENDING_PAYMENT" },
      }),
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.order.count({ where: { status: "CANCELLED" } }),
    ]);

    return {
      productTotal,
      activeProductCount,
      inactiveProductCount,
      categoryTotal,
      orderTotal,
      pendingPaymentCount,
      paidCount,
      cancelledCount,
    };
  }

  async function listOrders(
    search: AdminOrderSearch,
  ): Promise<AdminOrderListResult> {
    const page =
      Number.isSafeInteger(search.page) && search.page > 0
        ? search.page
        : 1;
    const where: Prisma.OrderWhereInput = {
      ...(search.q
        ? { orderNumber: { contains: search.q } }
        : {}),
      ...(search.status ? { status: search.status } : {}),
      ...paymentStatusWhere(search.paymentStatus),
    };

    const [totalCount, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        select: orderListSelect,
        orderBy: [
          { createdAt: "desc" },
          { orderNumber: "asc" },
        ],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return {
      orders: orders.map((order) => ({
        orderNumber: order.orderNumber,
        user: order.user,
        totalAmount: order.totalAmount,
        currency: order.currency,
        status: order.status,
        paymentStatus: toOverallPaymentStatus(
          order.payments.map((payment) => payment.status),
        ),
        createdAt: order.createdAt,
        paidAt: order.paidAt,
      })),
      totalCount,
      page,
      pageSize: PAGE_SIZE,
      totalPages:
        totalCount === 0
          ? 0
          : Math.ceil(totalCount / PAGE_SIZE),
    };
  }

  async function getOrderDetail(
    orderNumber: string,
  ): Promise<AdminOrderDetail | null> {
    if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
      return null;
    }

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      select: orderDetailSelect,
    });

    if (!order) {
      return null;
    }

    return {
      orderNumber: order.orderNumber,
      user: order.user,
      itemsAmount: order.itemsAmount,
      shippingAmount: order.shippingAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      currency: order.currency,
      status: order.status,
      createdAt: order.createdAt,
      expiresAt: order.expiresAt,
      paidAt: order.paidAt,
      cancelledAt: order.cancelledAt,
      completedAt: order.completedAt,
      items: order.items,
      payments: order.payments.map(toOrderPaymentView),
      shipping: {
        recipientName:
          order.shippingRecipientName?.trim() ||
          order.shippingName.trim(),
        phone: order.shippingPhone.trim(),
        province: order.shippingProvince?.trim() ?? "",
        city: order.shippingCity?.trim() ?? "",
        district: order.shippingDistrict?.trim() ?? "",
        addressLine:
          order.shippingAddressLine?.trim() ||
          order.shippingAddress.trim(),
        postalCode: nullableText(order.shippingPostalCode),
      },
    };
  }

  return {
    getDashboardStats,
    listOrders,
    getOrderDetail,
  };
}

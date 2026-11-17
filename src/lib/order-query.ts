import "server-only";

import { getCurrentUser } from "@/lib/auth-session";
import {
  createOrderQueryService,
  type GetOrdersInput,
} from "@/lib/order-query-service";
import { prisma } from "@/lib/prisma";

const orderQueryService = createOrderQueryService({
  prisma,
  getCurrentUserId: async () => {
    const user = await getCurrentUser();
    return user?.id ?? null;
  },
});

export function getOrders(input: GetOrdersInput = {}) {
  return orderQueryService.getOrders(input);
}

export function getOrderDetail(orderNumber: string) {
  return orderQueryService.getOrderDetail(orderNumber);
}

export {
  OrderQueryError,
  type GetOrdersInput,
  type OrderDetail,
  type OrderListItem,
  type OrderListResult,
  type OrderQueryErrorCode,
  type OrderQueryService,
  type OrderShippingSnapshot,
  type OrderSnapshotItem,
} from "@/lib/order-query-service";

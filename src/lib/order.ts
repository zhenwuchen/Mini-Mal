import "server-only";

import { getCurrentUser } from "@/lib/auth-session";
import { createOrderService } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";

const orderService = createOrderService({
  prisma,
  getCurrentUserId: async () => {
    const user = await getCurrentUser();
    return user?.id ?? null;
  },
});

export const createOrder = orderService.createOrder;

export {
  OrderError,
  type CreateOrderInput,
  type OrderErrorCode,
  type OrderService,
  type OrderSummary,
} from "@/lib/order-service";
export {
  INITIAL_ORDER_STATUS,
  ORDER_CURRENCY,
  ORDER_STATUS,
  type OrderStatus,
} from "@/lib/order-status";

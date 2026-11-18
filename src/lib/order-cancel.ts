import "server-only";

import { getCurrentUser } from "@/lib/auth-session";
import {
  createOrderCancelService,
  type CancelOrderInput,
  type OrderCancelResult,
} from "@/lib/order-cancel-service";
import { prisma } from "@/lib/prisma";

const orderCancelService = createOrderCancelService({
  prisma,
  getCurrentUserId: async () => {
    const user = await getCurrentUser();
    return user?.id ?? null;
  },
});

export const cancelOrder = orderCancelService.cancelOrder;

export type { CancelOrderInput, OrderCancelResult };

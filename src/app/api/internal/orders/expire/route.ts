import { randomUUID } from "node:crypto";

import {
  authenticateInternalTaskRequest,
} from "@/lib/internal-task-auth";
import {
  createInternalOrderExpirationHandler,
} from "@/lib/internal-order-expiration-handler";
import {
  createOrderExpirationService,
} from "@/lib/order-expiration-service";
import { prisma } from "@/lib/prisma";

const handleInternalOrderExpiration =
  createInternalOrderExpirationHandler({
    authenticate: ({ authorization }) =>
      authenticateInternalTaskRequest({ authorization }),
    createExpirationService: () =>
      createOrderExpirationService({ prisma }),
    createExecutionId: () => randomUUID(),
    log: (event) => {
      console.info(
        `[internal-order-expiration] ${JSON.stringify(event)}`,
      );
    },
  });

export async function POST(request: Request): Promise<Response> {
  return handleInternalOrderExpiration(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleInternalOrderExpiration(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handleInternalOrderExpiration(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handleInternalOrderExpiration(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleInternalOrderExpiration(request);
}

export async function HEAD(request: Request): Promise<Response> {
  return handleInternalOrderExpiration(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleInternalOrderExpiration(request);
}

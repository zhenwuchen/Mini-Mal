import assert from "node:assert/strict";
import test from "node:test";

import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

import { proxy } from "../src/proxy";

const prisma = new PrismaClient();

test("lets an inactive product reach its detail page", async (context) => {
  const fixture = `phase04-4-${process.pid}-${Date.now()}`;
  const category = await prisma.category.create({
    data: {
      name: `Phase 04-4 Category ${fixture}`,
      slug: `${fixture}-category`,
    },
  });

  const slug = `${fixture}-inactive-product`;
  const product = await prisma.product.create({
    data: {
      name: "Phase 04-4 Inactive Product",
      slug,
      price: 100,
      stock: 2,
      isActive: false,
      categoryId: category.id,
    },
  });

  context.after(async () => {
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  });

  const response = await proxy(
    new NextRequest(`http://localhost/products/${slug}`, {
      headers: { RSC: "1" },
    }),
  );

  assert.notEqual(response.status, 404);
});

test("keeps an unknown product slug as a 404", async () => {
  const response = await proxy(
    new NextRequest(
      `http://localhost/products/phase04-4-missing-${Date.now()}`,
      {
        headers: { RSC: "1" },
      },
    ),
  );

  assert.equal(response.status, 404);
});

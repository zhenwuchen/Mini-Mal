import assert from "node:assert/strict";
import test from "node:test";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

import {
  registerUser,
  verifyCredentials,
} from "../src/lib/auth-service";

const prisma = new PrismaClient();
const testEmailPrefix = "phase05-1-auth-";

test.after(async () => {
  await prisma.user.deleteMany({
    where: {
      email: {
        startsWith: testEmailPrefix,
      },
    },
  });
  await prisma.$disconnect();
});

test("registers a user with a hashed password", async () => {
  const email = `${testEmailPrefix}${Date.now()}@example.com`;
  const password = "GoodPass1!";

  const result = await registerUser({
    name: "Phase Test",
    email,
    password,
    confirmPassword: password,
  });

  assert.equal(result.success, true);
  if (!result.success) return;

  const user = await prisma.user.findUnique({ where: { email } });
  assert.ok(user);
  assert.notEqual(user.passwordHash, password);
  assert.equal(await bcrypt.compare(password, user.passwordHash), true);
  assert.equal(user.role, "USER");
});

test("rejects duplicate email registration", async () => {
  const email = `${testEmailPrefix}${Date.now()}-dup@example.com`;
  const input = {
    name: "Duplicate",
    email,
    password: "GoodPass1!",
    confirmPassword: "GoodPass1!",
  };

  assert.equal((await registerUser(input)).success, true);

  const duplicate = await registerUser(input);
  assert.equal(duplicate.success, false);
  if (duplicate.success) return;
  assert.equal(duplicate.fieldErrors.email, "该邮箱已注册");
});

test("ignores attempted role escalation during registration", async () => {
  const email = `${testEmailPrefix}${Date.now()}-role@example.com`;

  const result = await registerUser({
    name: "Role Test",
    email,
    password: "GoodPass1!",
    confirmPassword: "GoodPass1!",
    role: "ADMIN",
  });

  assert.equal(result.success, true);

  const user = await prisma.user.findUnique({ where: { email } });
  assert.equal(user?.role, "USER");

  const verified = await verifyCredentials(email, "GoodPass1!");
  assert.equal(verified?.role, "USER");
});

test("verifies correct credentials and rejects a wrong password", async () => {
  const email = `${testEmailPrefix}${Date.now()}-login@example.com`;

  await registerUser({
    name: "Login Test",
    email,
    password: "GoodPass1!",
    confirmPassword: "GoodPass1!",
  });

  const verified = await verifyCredentials(email, "GoodPass1!");
  assert.deepEqual(
    verified && {
      email: verified.email,
      role: verified.role,
    },
    {
      email,
      role: "USER",
    },
  );
  assert.equal(await verifyCredentials(email, "WrongPass1!"), null);
  assert.equal(
    await verifyCredentials(
      `${testEmailPrefix}${Date.now()}-missing@example.com`,
      "GoodPass1!",
    ),
    null,
  );
});

test("recognizes an administrator role from the database", async () => {
  const email = `${testEmailPrefix}${Date.now()}-admin@example.com`;
  const passwordHash = await bcrypt.hash("AdminPass1!", 12);

  await prisma.user.create({
    data: {
      name: "Admin Test",
      email,
      passwordHash,
      role: "ADMIN",
    },
  });

  const verified = await verifyCredentials(email, "AdminPass1!");
  assert.equal(verified?.role, "ADMIN");
});

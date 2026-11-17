import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  isValidEmail,
  normalizeEmail,
  validateRegistrationInput,
  type RegistrationFieldErrors,
  type RegistrationInput,
} from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";

export type UserRole = "USER" | "ADMIN";

export type AuthUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
};

export type RegisterUserResult =
  | {
      success: true;
      user: AuthUser;
    }
  | {
      success: false;
      fieldErrors: RegistrationFieldErrors;
    };

type RegistrationPayload = RegistrationInput &
  Record<string, unknown>;

const dummyPasswordHash =
  "$2b$12$uqwu33aS.yi/1uc62fdP.eGqcLGiEnWB006aM0NZCYl1594kD3yPi";

export function normalizeUserRole(role: string): UserRole {
  return role === "ADMIN" ? "ADMIN" : "USER";
}

export async function registerUser(
  input: RegistrationPayload,
): Promise<RegisterUserResult> {
  const validation = validateRegistrationInput(input);

  if (!validation.success) {
    return validation;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: validation.data.email },
    select: { id: true },
  });

  if (existingUser) {
    return {
      success: false,
      fieldErrors: { email: "该邮箱已注册" },
    };
  }

  const passwordHash = await bcrypt.hash(validation.data.password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name: validation.data.name,
        email: validation.data.email,
        passwordHash,
        role: "USER",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return {
      success: true,
      user: {
        ...user,
        role: normalizeUserRole(user.role),
      },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        fieldErrors: { email: "该邮箱已注册" },
      };
    }

    throw error;
  }
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const normalizedEmail = normalizeEmail(email);

  if (!isValidEmail(normalizedEmail) || !password) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      name: true,
      email: true,
      passwordHash: true,
      role: true,
    },
  });

  if (!user) {
    await bcrypt.compare(password, dummyPasswordHash);
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeUserRole(user.role),
  };
}

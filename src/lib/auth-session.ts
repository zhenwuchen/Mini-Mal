import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/auth";
import type { AuthUser, UserRole } from "@/lib/auth-service";
import { sanitizeAuthRedirect } from "@/lib/auth-validation";

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  await connection();

  const session = await auth();

  if (!session?.user?.id || !session.user.email) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name ?? null,
    email: session.user.email,
    role: session.user.role satisfies UserRole,
  };
});

export async function requireUser(returnTo = "/"): Promise<AuthUser> {
  const user = await getCurrentUser();

  if (user) {
    return user;
  }

  const safeReturnTo = sanitizeAuthRedirect(returnTo);
  redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo)}`);
}

export async function requireAdmin(returnTo = "/"): Promise<AuthUser> {
  const user = await requireUser(returnTo);

  if (user.role !== "ADMIN") {
    redirect("/account");
  }

  return user;
}

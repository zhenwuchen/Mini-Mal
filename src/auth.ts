import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import {
  normalizeEmail,
  sanitizeAuthRedirect,
} from "@/lib/auth-validation";
import {
  normalizeUserRole,
  verifyCredentials,
} from "@/lib/auth-service";

export const { handlers, signIn, signOut, auth, unstable_update } =
  NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  logger: {
    error(error) {
      if (error instanceof CredentialsSignin) {
        return;
      }

      console.error(`[auth] ${error.name}`);
    },
  },
  providers: [
    Credentials({
      name: "邮箱与密码",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (
          typeof credentials.email !== "string" ||
          typeof credentials.password !== "string"
        ) {
          return null;
        }

        return verifyCredentials(
          normalizeEmail(credentials.email),
          credentials.password,
        );
      },
    }),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = normalizeUserRole(user.role);
      }

      if (trigger === "update" && session?.user) {
        token.name = session.user.name ?? null;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id =
          typeof token.id === "string" ? token.id : (token.sub ?? "");
        session.user.role = normalizeUserRole(
          typeof token.role === "string" ? token.role : "USER",
        );
      }

      return session;
    },
    redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        return `${baseUrl}${sanitizeAuthRedirect(url)}`;
      }

      try {
        const target = new URL(url);
        return target.origin === baseUrl ? target.toString() : baseUrl;
      } catch {
        return baseUrl;
      }
    },
  },
});

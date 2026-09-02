import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";

/** The only role that may reach /admin/* or /api/admin/*. */
export const ADMIN_ROLE = "admin";

/**
 * Sign-up is disabled: the sole account in this system is Gabrielle's admin
 * login, and there is no customer auth (bookings are keyed by email address).
 * `allowSignUp` exists for scripts/seed-admin.ts, which creates that account
 * in-process; the exported `auth` — the one mounted at /api/auth/[...all] —
 * always has sign-up off, so no HTTP request can create an account.
 */
export function createAuth({
  allowSignUp = false,
}: {
  allowSignUp?: boolean;
} = {}) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignUp,
    },
    user: {
      additionalFields: {
        // `input: false` so the role can never be set through an auth
        // endpoint, and is returned on the session for the proxy to check.
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
  });
}

export const auth = createAuth();

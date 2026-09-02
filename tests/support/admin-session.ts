import { vi } from "vitest";

/**
 * The fake session every admin route test runs behind.
 *
 * `withAdmin` resolves the caller through `@/lib/auth` on every request, so a
 * handler called directly from a test is unauthenticated unless the test says
 * otherwise. Each admin test file mocks the module with:
 *
 * ```ts
 * vi.mock("@/lib/auth", async () =>
 *   (await import("../support/admin-session")).authModuleMock,
 * );
 * ```
 *
 * and then names the caller it wants: `signedInAsAdmin()`, `signedOut()`,
 * `signedInAsNonAdmin()`.
 */
interface SessionUser {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface Session {
  session: { id: string };
  user: SessionUser;
}

export const ADMIN_USER: SessionUser = {
  id: "usr_admin",
  email: "gabrielle@moontide.test",
  name: "Gabrielle",
  role: "admin",
};

export const ADMIN_SESSION: Session = {
  session: { id: "ses_admin" },
  user: ADMIN_USER,
};

export const getSession = vi.fn<
  (args: { headers: Headers }) => Promise<Session | null>
>(async () => ADMIN_SESSION);

export const authModuleMock = {
  ADMIN_ROLE: "admin",
  auth: { api: { getSession } },
};

/** Gabrielle, signed in. The default, and the way back from the others. */
export function signedInAsAdmin() {
  getSession.mockResolvedValue(ADMIN_SESSION);
}

/** Nobody: no cookie, or one that resolves to nothing. */
export function signedOut() {
  getSession.mockResolvedValue(null);
}

/** A real session on a user who is not the admin. */
export function signedInAsNonAdmin() {
  getSession.mockResolvedValue({
    session: { id: "ses_customer" },
    user: {
      id: "usr_customer",
      email: "jane@example.com",
      name: "Jane Doe",
      role: "user",
    },
  });
}

/** A real session carrying no role at all. */
export function signedInWithoutRole() {
  getSession.mockResolvedValue({
    session: { id: "ses_roleless" },
    user: { id: "usr_roleless", email: "x@y.z", name: "X" },
  });
}

/** The session table cannot be reached. */
export function sessionLookupFails() {
  getSession.mockRejectedValue(new Error("database unreachable"));
}

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
 * and reaches for `getSession` when it wants to sign out or demote the caller.
 */
export const ADMIN_USER = {
  id: "usr_admin",
  email: "gabrielle@moontide.test",
  name: "Gabrielle",
  role: "admin",
};

export const ADMIN_SESSION = {
  session: { id: "ses_admin" },
  user: ADMIN_USER,
};

export const getSession = vi.fn(async () => ADMIN_SESSION);

export const authModuleMock = {
  ADMIN_ROLE: "admin",
  auth: { api: { getSession } },
};

/** Sign the caller back in — undo a `signedOut()`/`demoted()` in a later test. */
export function signedInAsAdmin() {
  getSession.mockResolvedValue(ADMIN_SESSION);
}

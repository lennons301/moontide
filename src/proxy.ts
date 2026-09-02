import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ADMIN_ROLE, auth } from "@/lib/auth";

const SIGN_UP_PATH = "/api/auth/sign-up";

/**
 * The session is validated, not sniffed for: a cookie is just a string a
 * visitor can type, so the token is resolved against the session table and the
 * user behind it must carry the admin role. Anything else — no cookie, a
 * forged one, an expired one, a valid session on a non-admin user, or a
 * database that will not answer — is refused.
 */
async function hasAdminSession(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user?.role === ADMIN_ROLE;
  } catch {
    // Fail closed: an unreachable database is not an authorisation.
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Accounts are created by the seed script, never over HTTP. Better Auth
  // refuses this itself (`disableSignUp`); the endpoint is closed here too so
  // that re-enabling sign-up needs two deliberate changes, not one.
  if (pathname === SIGN_UP_PATH || pathname.startsWith(`${SIGN_UP_PATH}/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdminPage =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next();
  }

  if (await hasAdminSession(request)) {
    return NextResponse.next();
  }

  if (isAdminApi) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/auth/:path*"],
};

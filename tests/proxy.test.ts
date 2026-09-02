import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/auth", () => ({
  ADMIN_ROLE: "admin",
  auth: { api: { getSession } },
}));

const { proxy } = await import("@/proxy");

type CookieEntry = { name: string; value: string };

function makeRequest(pathname: string, cookies: CookieEntry[] = []) {
  const url = `http://localhost:3000${pathname}`;
  const headers = new Headers();
  if (cookies.length > 0) {
    headers.set(
      "cookie",
      cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    );
  }
  return {
    nextUrl: new URL(url),
    url,
    headers,
  } as unknown as Parameters<typeof proxy>[0];
}

function adminSession() {
  return { session: { id: "ses_1" }, user: { id: "usr_1", role: "admin" } };
}

const forgedCookie: CookieEntry = {
  name: "better-auth.session_token",
  value: "not-a-real-token",
};

describe("proxy", () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue(null);
  });

  it("passes through non-admin paths without checking auth", async () => {
    const res = await proxy(makeRequest("/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("passes through /admin/login without checking auth", async () => {
    const res = await proxy(makeRequest("/admin/login"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated /admin/* page requests to /admin/login", async () => {
    const res = await proxy(makeRequest("/admin/schedule"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/admin/login",
    );
  });

  it("returns 401 JSON for unauthenticated /api/admin/* requests", async () => {
    const res = await proxy(makeRequest("/api/admin/waitlist?scheduleId=1"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects a forged session cookie on /api/admin/*", async () => {
    const res = await proxy(makeRequest("/api/admin/waitlist", [forgedCookie]));
    expect(res.status).toBe(401);
    expect(res.headers.get("x-middleware-next")).toBeNull();
  });

  it("rejects a forged session cookie on /admin/*", async () => {
    const res = await proxy(makeRequest("/admin/bookings", [forgedCookie]));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/admin/login",
    );
  });

  it("rejects a forged __Secure- prefixed cookie", async () => {
    const res = await proxy(
      makeRequest("/api/admin/waitlist", [
        { name: "__Secure-better-auth.session_token", value: "junk" },
      ]),
    );
    expect(res.status).toBe(401);
  });

  it("validates the cookie against the session, not its presence", async () => {
    await proxy(makeRequest("/api/admin/waitlist", [forgedCookie]));
    expect(getSession).toHaveBeenCalledTimes(1);
    const headers = getSession.mock.calls[0][0].headers as Headers;
    expect(headers.get("cookie")).toBe(
      "better-auth.session_token=not-a-real-token",
    );
  });

  it("rejects a valid session whose user is not an admin", async () => {
    getSession.mockResolvedValue({
      session: { id: "ses_2" },
      user: { id: "usr_2", role: "user" },
    });

    const apiRes = await proxy(makeRequest("/api/admin/bookings"));
    expect(apiRes.status).toBe(401);

    const pageRes = await proxy(makeRequest("/admin/bookings"));
    expect(pageRes.status).toBe(307);
  });

  it("rejects a valid session with no role at all", async () => {
    getSession.mockResolvedValue({
      session: { id: "ses_3" },
      user: { id: "usr_3" },
    });

    const res = await proxy(makeRequest("/api/admin/bookings"));
    expect(res.status).toBe(401);
  });

  it("rejects when the session lookup fails", async () => {
    getSession.mockRejectedValue(new Error("database unreachable"));

    const res = await proxy(makeRequest("/api/admin/bookings"));
    expect(res.status).toBe(401);
  });

  it("allows /admin/* page requests for an admin session", async () => {
    getSession.mockResolvedValue(adminSession());

    const res = await proxy(makeRequest("/admin/schedule"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /api/admin/* requests for an admin session", async () => {
    getSession.mockResolvedValue(adminSession());

    const res = await proxy(makeRequest("/api/admin/waitlist"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("blocks the public sign-up endpoint", async () => {
    const res = await proxy(makeRequest("/api/auth/sign-up/email"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("blocks sign-up even for an admin session", async () => {
    getSession.mockResolvedValue(adminSession());

    const res = await proxy(makeRequest("/api/auth/sign-up"));
    expect(res.status).toBe(404);
  });

  it("leaves the rest of the auth endpoints alone", async () => {
    for (const path of [
      "/api/auth/sign-in/email",
      "/api/auth/get-session",
      "/api/auth/sign-out",
    ]) {
      const res = await proxy(makeRequest(path));
      expect(res.headers.get("x-middleware-next")).toBe("1");
    }
    expect(getSession).not.toHaveBeenCalled();
  });
});

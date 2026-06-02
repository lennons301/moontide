import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

type CookieEntry = { name: string; value: string };

function makeRequest(pathname: string, cookies: CookieEntry[] = []) {
  const url = `http://localhost:3000${pathname}`;
  const cookieMap = new Map(cookies.map((c) => [c.name, c]));
  return {
    nextUrl: new URL(url),
    url,
    cookies: {
      get(name: string) {
        return cookieMap.get(name);
      },
    },
  } as unknown as Parameters<typeof proxy>[0];
}

describe("proxy", () => {
  it("passes through non-admin paths without checking auth", () => {
    const res = proxy(makeRequest("/"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes through /admin/login without checking auth", () => {
    const res = proxy(makeRequest("/admin/login"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects unauthenticated /admin/* page requests to /admin/login", () => {
    const res = proxy(makeRequest("/admin/schedule"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/admin/login",
    );
  });

  it("returns 401 JSON for unauthenticated /api/admin/* requests", async () => {
    const res = proxy(makeRequest("/api/admin/waitlist?scheduleId=1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("allows /admin/* page requests when session cookie is present", () => {
    const res = proxy(
      makeRequest("/admin/schedule", [
        { name: "better-auth.session_token", value: "abc" },
      ]),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("allows /api/admin/* requests when session cookie is present", () => {
    const res = proxy(
      makeRequest("/api/admin/waitlist", [
        { name: "better-auth.session_token", value: "abc" },
      ]),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("accepts the __Secure- prefixed cookie", () => {
    const res = proxy(
      makeRequest("/api/admin/waitlist", [
        { name: "__Secure-better-auth.session_token", value: "abc" },
      ]),
    );
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});

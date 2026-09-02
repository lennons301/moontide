import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

import { z } from "zod";
import { ApiError, withAdmin } from "@/app/api/admin/_lib";
import {
  ADMIN_USER,
  getSession,
  sessionLookupFails,
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedInWithoutRole,
  signedOut,
} from "../support/admin-session";

const URL_BASE = "http://localhost:3000/api/admin/anything";

function get(search = "") {
  return new Request(`${URL_BASE}${search}`);
}

function post(body: unknown) {
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ok = () => Response.json({ ok: true });

/**
 * A handler that answers 200 and keeps what it was handed, so a test can ask
 * what reached it — or that nothing did.
 */
function spy() {
  const seen: Array<{
    request: Request;
    body: unknown;
    query: unknown;
    user: unknown;
  }> = [];
  const handler = vi.fn((context: (typeof seen)[number]) => {
    seen.push(context);
    return ok();
  });
  return { seen, handler };
}

describe("withAdmin — who is asking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
  });

  it("runs the handler for an admin session, and hands it the user", async () => {
    const { seen, handler } = spy();
    const response = await withAdmin({}, handler)(get());

    expect(response.status).toBe(200);
    expect(seen[0].user).toEqual(ADMIN_USER);
  });

  it("resolves the session from the request's own headers", async () => {
    const request = new Request(URL_BASE, {
      headers: { cookie: "better-auth.session_token=abc" },
    });
    await withAdmin({}, ok)(request);

    const headers = getSession.mock.calls[0][0].headers as Headers;
    expect(headers.get("cookie")).toBe("better-auth.session_token=abc");
  });

  it("returns 401 and never calls the handler when there is no session", async () => {
    signedOut();
    const { handler } = spy();

    const response = await withAdmin({}, handler)(get());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 for a real session on a user who is not an admin", async () => {
    signedInAsNonAdmin();
    const { handler } = spy();

    const response = await withAdmin({}, handler)(get());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 for a session carrying no role at all", async () => {
    signedInWithoutRole();

    const response = await withAdmin({}, ok)(get());
    expect(response.status).toBe(403);
  });

  it("fails closed when the session lookup throws", async () => {
    sessionLookupFails();

    const response = await withAdmin({}, ok)(get());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("checks the session before it reads the body", async () => {
    signedOut();
    const schema = z.object({ id: z.number() });

    const response = await withAdmin({ body: schema }, ok)(post("not json"));

    expect(response.status).toBe(401);
  });
});

describe("withAdmin — the body", () => {
  const schema = z.object({
    id: z.number({ error: "Missing id" }),
    note: z.string().optional(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
  });

  it("hands the handler the parsed body", async () => {
    const { handler } = spy();
    await withAdmin({ body: schema }, handler)(post({ id: 7, note: "hi" }));

    expect(handler.mock.calls[0][0].body).toEqual({ id: 7, note: "hi" });
  });

  it("returns 400 for a malformed body rather than throwing a 500", async () => {
    const { handler } = spy();
    const response = await withAdmin(
      { body: schema },
      handler,
    )(post("{ not json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 400 with no body at all", async () => {
    const response = await withAdmin(
      { body: schema },
      ok,
    )(new Request(URL_BASE, { method: "POST" }));

    expect(response.status).toBe(400);
  });

  it("answers with the schema's own message", async () => {
    const response = await withAdmin({ body: schema }, ok)(post({}));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing id" });
  });

  it("says one thing once when several fields share a complaint", async () => {
    const missing = { error: "Missing required fields" };
    const wide = z.object({
      a: z.string(missing),
      b: z.string(missing),
      c: z.string(missing),
    });

    const response = await withAdmin({ body: wide }, ok)(post({}));

    expect(await response.json()).toEqual({ error: "Missing required fields" });
  });

  it("leaves the body undefined when no schema asks for one", async () => {
    const { handler } = spy();
    await withAdmin({}, handler)(post({ id: 7 }));

    expect(handler.mock.calls[0][0].body).toBeUndefined();
  });
});

describe("withAdmin — the query string", () => {
  const schema = z.object({
    scheduleId: z.coerce.number({ error: "Missing scheduleId" }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
  });

  it("coerces the parameters it is given", async () => {
    const { handler } = spy();
    await withAdmin({ query: schema }, handler)(get("?scheduleId=42"));

    expect(handler.mock.calls[0][0].query).toEqual({ scheduleId: 42 });
  });

  it("returns 400 when a parameter is missing", async () => {
    const response = await withAdmin({ query: schema }, ok)(get());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing scheduleId" });
  });

  it("returns 400 when a parameter is not a number", async () => {
    const response = await withAdmin(
      { query: schema },
      ok,
    )(get("?scheduleId=x"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing scheduleId" });
  });
});

describe("withAdmin — what goes wrong inside the handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
  });

  it("renders a thrown ApiError as the standard shape", async () => {
    const response = await withAdmin({}, () => {
      throw new ApiError(409, "They already have a booking for this class");
    })(get());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "They already have a booking for this class",
    });
  });

  it("turns anything else into a 500 that says nothing about the fault", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await withAdmin({}, () => {
      throw new Error("column bookings.nope does not exist");
    })(get());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong" });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("maps a rejected promise the same way", async () => {
    const response = await withAdmin({}, async () => {
      await Promise.reject(new ApiError(400, "Target class is full"));
      return ok();
    })(get());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Target class is full" });
  });
});

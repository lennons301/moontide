import { afterEach, describe, expect, it, vi } from "vitest";
import { mutateAdmin, requestAdmin } from "@/components/admin/admin-fetch";
import { goToLogin } from "@/lib/admin/navigate";
import { stubFetch } from "../../support/fetch-stub";

vi.mock("@/lib/admin/navigate", () => ({
  LOGIN_PATH: "/admin/login",
  goToLogin: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(goToLogin).mockClear();
});

describe("requestAdmin", () => {
  it("answers with the parsed body", async () => {
    stubFetch({ "GET /api/admin/bundles": { json: [{ id: 1 }] } });

    const result = await requestAdmin<{ id: number }[]>("/api/admin/bundles");

    expect(result).toEqual({ ok: true, data: [{ id: 1 }] });
  });

  it("takes an expired session to the login page rather than parsing the 401", async () => {
    // What the proxy answers with. It used to be set as the list of rows.
    stubFetch({
      "GET /api/admin/schedules": {
        status: 401,
        json: { error: "Unauthorized" },
      },
    });

    const result = await requestAdmin("/api/admin/schedules");

    expect(goToLogin).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
    expect(result.error).toMatch(/session has expired/i);
  });

  it("surfaces the server's own wording for a refusal", async () => {
    stubFetch({
      "PUT /api/admin/bookings": {
        status: 400,
        json: { error: "Booking is already cancelled" },
      },
    });

    const result = await requestAdmin("/api/admin/bookings", { method: "PUT" });

    expect(result).toEqual({
      ok: false,
      error: "Booking is already cancelled",
      status: 400,
    });
  });

  it("does not throw on a failure that is not JSON", async () => {
    // A 502 from in front of the app answers with HTML. Reading it as JSON is
    // what left the pricing page's Save button disabled until a reload.
    stubFetch({
      "PUT /api/admin/pricing": { status: 502, html: "<html>Bad gateway" },
    });

    const result = await requestAdmin("/api/admin/pricing", { method: "PUT" });

    expect(result).toEqual({
      ok: false,
      error: "Something went wrong (502).",
      status: 502,
    });
  });

  it("does not throw on a success that is not JSON either", async () => {
    stubFetch({ "GET /api/admin/classes": { html: "<html>Not the app" } });

    const result = await requestAdmin("/api/admin/classes");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/could not read/i);
  });

  it("says so when the request never reached a server", async () => {
    stubFetch({ "GET /api/admin/messages": { networkError: true } });

    const result = await requestAdmin("/api/admin/messages");

    expect(result).toEqual({
      ok: false,
      error: "Could not reach the server. Check your connection and try again.",
      status: 0,
    });
  });

  it("ignores an error field that is not a sentence", async () => {
    stubFetch({
      "GET /api/admin/bookings": { status: 500, json: { error: "" } },
    });

    const result = await requestAdmin("/api/admin/bookings");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Something went wrong (500).");
  });
});

describe("mutateAdmin", () => {
  it("sends JSON, with the one Content-Type header", async () => {
    const fetchMock = stubFetch({
      "POST /api/admin/resend-email": { json: { sent: true } },
    });

    const result = await mutateAdmin("/api/admin/resend-email", {
      method: "POST",
      body: { type: "booking", id: 7 },
    });

    expect(result).toEqual({ ok: true, data: { sent: true } });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/resend-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "booking", id: 7 }),
    });
  });

  it("sends no body or header for the routes that carry everything in the query", async () => {
    const fetchMock = stubFetch({
      "DELETE /api/admin/waitlist": { json: { deleted: true } },
    });

    await mutateAdmin("/api/admin/waitlist?id=3", { method: "DELETE" });

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/waitlist?id=3", {
      method: "DELETE",
    });
  });

  it("carries the refusal back to the caller", async () => {
    stubFetch({
      "DELETE /api/admin/waitlist": {
        status: 409,
        json: { error: "Withdraw the offer before removing this person" },
      },
    });

    const result = await mutateAdmin("/api/admin/waitlist?id=3", {
      method: "DELETE",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Withdraw the offer before removing this person");
  });
});

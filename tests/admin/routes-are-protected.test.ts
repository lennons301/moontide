import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

/**
 * Every admin route goes through `withAdmin`, so none of them should reach the
 * database for a caller who has not proved they are Gabrielle. The stub makes
 * that literal: touch the database and the test fails.
 */
const { touchedTheDatabase } = vi.hoisted(() => {
  const touchedTheDatabase = vi.fn(() => {
    throw new Error("the handler reached the database");
  });
  return { touchedTheDatabase };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: touchedTheDatabase,
    insert: touchedTheDatabase,
    update: touchedTheDatabase,
    delete: touchedTheDatabase,
    transaction: touchedTheDatabase,
  },
}));

// Resend wants an API key the moment @/lib/email is imported, and no email is
// sent on any path this file exercises.
vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: vi.fn(),
  sendBookingNotification: vi.fn(),
  sendBundleConfirmation: vi.fn(),
  sendRescheduleNotification: vi.fn(),
  sendSeatOffer: vi.fn(),
}));

import {
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedOut,
} from "../support/admin-session";

type Handler = (request: Request) => Promise<Response>;

/**
 * The routes are discovered, not listed: a new directory under /api/admin is
 * swept the moment it exists, without anyone remembering to add it here.
 */
const MODULES = import.meta.glob("/src/app/api/admin/**/route.ts", {
  eager: true,
}) as Record<string, Record<string, unknown>>;

/** A body each body-reading handler would otherwise accept, by method and route. */
const BODIES: Record<string, unknown> = {
  "PUT /api/admin/bookings": { id: 1, status: "cancelled" },
  "PUT /api/admin/messages": { id: 1, read: true },
  "PUT /api/admin/pricing": { classes: [{ id: 1, priceInPence: 1500 }] },
  "POST /api/admin/resend-email": { type: "booking", id: 1 },
  "POST /api/admin/schedules": {
    classId: 1,
    date: "2026-06-09",
    startTime: "10:00",
    endTime: "11:00",
  },
  "PUT /api/admin/schedules": { id: 1, capacity: 10 },
  "DELETE /api/admin/schedules": { id: 1 },
  "POST /api/admin/waitlist/offer": { entryId: 1, hold: "24h" },
};

/** The query string each query-reading route would otherwise accept. */
const QUERIES: Record<string, string> = {
  "/api/admin/waitlist": "?scheduleId=1&id=1",
  "/api/admin/waitlist/offer": "?entryId=1",
};

/** Every handler under /api/admin, and a request each would otherwise accept. */
const HANDLERS: Array<[string, Handler, Request]> = [];
/** The subset that reads a JSON body, each paired with a broken one. */
const BODY_HANDLERS: Array<[string, Handler, Request]> = [];

const DISCOVERED = Object.keys(MODULES).sort();

for (const file of DISCOVERED) {
  const module = MODULES[file];
  const path = file.replace("/src/app", "").replace("/route.ts", "");
  const url = `http://localhost:3000${path}${QUERIES[path] ?? ""}`;

  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const handler = module[method];
    if (typeof handler !== "function") continue;
    const name = `${method} ${path}`;
    const body = BODIES[name];

    if (body !== undefined) {
      BODY_HANDLERS.push([
        name,
        handler as Handler,
        new Request(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: "{ definitely not json",
        }),
      ]);
    }

    HANDLERS.push([
      name,
      handler as Handler,
      new Request(url, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      }),
    ]);
  }
}

describe("every /api/admin handler checks the session itself", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Nine route files, seventeen exported handlers. The counts are asserted so
  // that a route file emptied by a bad merge reads as a failure rather than as
  // a sweep with nothing left to sweep.
  it("covers every handler under /api/admin", () => {
    expect(DISCOVERED).toHaveLength(9);
    expect(HANDLERS).toHaveLength(17);
    expect(BODY_HANDLERS).toHaveLength(8);
  });

  it.each(
    HANDLERS,
  )("%s returns 401 when signed out", async (_name, handler, request) => {
    signedOut();

    const response = await handler(request.clone());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(touchedTheDatabase).not.toHaveBeenCalled();
  });

  it.each(
    HANDLERS,
  )("%s returns 403 for a session without the admin role", async (_name, handler, request) => {
    signedInAsNonAdmin();

    const response = await handler(request.clone());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(touchedTheDatabase).not.toHaveBeenCalled();
  });

  it.each(
    BODY_HANDLERS,
  )("%s answers a malformed body with 400, not a 500", async (_name, handler, request) => {
    signedInAsAdmin();

    const response = await handler(request.clone());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(touchedTheDatabase).not.toHaveBeenCalled();
  });
});

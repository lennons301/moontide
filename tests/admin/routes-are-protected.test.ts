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

import * as bookings from "@/app/api/admin/bookings/route";
import * as bundles from "@/app/api/admin/bundles/route";
import * as classes from "@/app/api/admin/classes/route";
import * as messages from "@/app/api/admin/messages/route";
import * as pricing from "@/app/api/admin/pricing/route";
import * as resendEmail from "@/app/api/admin/resend-email/route";
import * as schedules from "@/app/api/admin/schedules/route";
import * as waitlistOffer from "@/app/api/admin/waitlist/offer/route";
import * as waitlist from "@/app/api/admin/waitlist/route";
import {
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedOut,
} from "../support/admin-session";

type Handler = (request: Request) => Promise<Response>;

/** Every handler under /api/admin, and a request each would otherwise accept. */
const HANDLERS: Array<[string, Handler, Request]> = [];
/** The subset that reads a JSON body, each paired with a broken one. */
const BODY_HANDLERS: Array<[string, Handler, Request]> = [];

function route(
  name: string,
  handlers: Record<string, unknown>,
  path: string,
  bodies: Record<string, unknown> = {},
) {
  for (const method of ["GET", "POST", "PUT", "DELETE"]) {
    const handler = handlers[method];
    if (typeof handler !== "function") continue;
    const body = bodies[method];
    if (body !== undefined) {
      BODY_HANDLERS.push([
        `${method} ${name}`,
        handler as Handler,
        new Request(`http://localhost:3000${path}`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: "{ definitely not json",
        }),
      ]);
    }
    HANDLERS.push([
      `${method} ${name}`,
      handler as Handler,
      new Request(`http://localhost:3000${path}`, {
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

route("/api/admin/bookings", bookings, "/api/admin/bookings", {
  PUT: { id: 1, status: "cancelled" },
});
route("/api/admin/bundles", bundles, "/api/admin/bundles");
route("/api/admin/classes", classes, "/api/admin/classes");
route("/api/admin/messages", messages, "/api/admin/messages", {
  PUT: { id: 1, read: true },
});
route("/api/admin/pricing", pricing, "/api/admin/pricing", {
  PUT: { classes: [{ id: 1, priceInPence: 1500 }] },
});
route("/api/admin/resend-email", resendEmail, "/api/admin/resend-email", {
  POST: { type: "booking", id: 1 },
});
route("/api/admin/schedules", schedules, "/api/admin/schedules", {
  POST: {
    classId: 1,
    date: "2026-06-09",
    startTime: "10:00",
    endTime: "11:00",
  },
  PUT: { id: 1, capacity: 10 },
  DELETE: { id: 1 },
});
route("/api/admin/waitlist", waitlist, "/api/admin/waitlist?scheduleId=1&id=1");
route(
  "/api/admin/waitlist/offer",
  waitlistOffer,
  "/api/admin/waitlist/offer?entryId=1",
  { POST: { entryId: 1, hold: "24h" } },
);

describe("every /api/admin handler checks the session itself", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Eight route files, seventeen exported handlers. The count is asserted so
  // that a handler added without a session check cannot slip in unnoticed.
  it("covers every handler under /api/admin", () => {
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

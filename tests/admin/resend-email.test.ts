import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

const { selectRows, mockSelectFrom, mockUpdate, mockUpdateSet, mockEq } =
  vi.hoisted(() => {
    const selectRows: unknown[] = [];
    const selectWhere = vi.fn(async () => selectRows);
    const mockInnerJoin = vi.fn();
    const mockLeftJoin = vi.fn();
    const mockSelectFrom = vi.fn().mockReturnValue({
      innerJoin: mockInnerJoin,
      // The bundle read joins its config straight off `from`.
      leftJoin: mockLeftJoin,
    });
    mockInnerJoin.mockReturnValue({
      innerJoin: mockInnerJoin,
      leftJoin: mockLeftJoin,
      where: selectWhere,
    });
    // Two left joins on the booking read: the bundle that funded it, and the
    // class it was moved off.
    mockLeftJoin.mockReturnValue({
      leftJoin: mockLeftJoin,
      where: selectWhere,
    });

    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

    return {
      selectRows,
      mockSelectFrom,
      mockUpdate,
      mockUpdateSet,
      mockEq: vi.fn((...args: unknown[]) => args),
    };
  });

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    update: mockUpdate,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: {
    id: "bookings.id",
    scheduleId: "bookings.schedule_id",
    emailAttempts: "bookings.email_attempts",
  },
  bundles: {
    id: "bundles.id",
    bundleConfigId: "bundles.bundle_config_id",
    emailAttempts: "bundles.email_attempts",
  },
  bundleConfig: { id: "bundle_config.id", credits: "bundle_config.credits" },
  classes: { id: "classes.id" },
  schedules: { id: "schedules.id", classId: "schedules.class_id" },
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((table: unknown) => table),
}));

vi.mock("drizzle-orm", () => ({
  eq: mockEq,
  sql: vi.fn((...args: unknown[]) => args),
}));

import { POST } from "@/app/api/admin/resend-email/route";
import type { InMemoryEmails } from "@/lib/notifications/in-memory-adapter";
import {
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedOut,
} from "../support/admin-session";
import {
  givenEmailsCollected,
  resetEmailAdapter,
} from "../support/notifications";

/**
 * The route is exercised through the real notification module, against the
 * in-memory transport: what Gabrielle presses resend for is an email arriving,
 * and the delivery record it leaves behind is half the behaviour under test.
 */
let inbox: InMemoryEmails;

beforeEach(() => {
  inbox = givenEmailsCollected();
});

afterEach(resetEmailAdapter);

function queue(...rows: unknown[]) {
  selectRows.length = 0;
  selectRows.push(...rows);
}

function request(body: unknown) {
  return new Request("http://localhost:3000/api/admin/resend-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const BOOKING_ROW = {
  bookings: {
    id: 12,
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    status: "confirmed",
    emailKind: "confirmation",
    classTitle: "Prenatal Yoga",
  },
  schedules: {
    id: 42,
    date: "2026-06-09",
    startTime: "10:00:00",
    endTime: "11:00:00",
    location: "Studio 1, Hove",
  },
  classes: { id: 3, title: "Prenatal Yoga", priceInPence: 1500 },
  // The bundle the booking was funded from: a left join, so null when the
  // customer paid by card.
  bundles: null,
  // The class it was moved off: the same left join, null for a booking that has
  // never been rescheduled.
  original_schedules: null,
};

const BUNDLE_ROW = {
  bundles: {
    id: 5,
    customerEmail: "jane@example.com",
    creditsTotal: 6,
    expiresAt: "2026-12-01T00:00:00.000Z",
    bundleConfigId: 2,
  },
  bundle_config: { id: 2, name: "6-Class Bundle", credits: 6 },
};

describe("POST /api/admin/resend-email — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    queue();
  });

  it("returns 400 for a type that is neither booking nor bundle", async () => {
    const response = await POST(request({ type: "postcard", id: 1 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid type" });
    expect(mockSelectFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when the id is missing", async () => {
    const response = await POST(request({ type: "booking" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing id" });
  });

  it("returns 400 rather than 500 for a malformed body", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 401 for an unauthenticated caller and sends nothing", async () => {
    signedOut();

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(401);
    expect(inbox.sent).toEqual([]);
  });

  it("returns 403 for a signed-in caller who is not the admin", async () => {
    signedInAsNonAdmin();

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(403);
    expect(inbox.sent).toEqual([]);
  });
});

describe("POST /api/admin/resend-email — a booking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    queue(BOOKING_ROW);
  });

  it("sends the confirmation and the notification, then marks it sent", async () => {
    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const [customer, admin] = inbox.sent;
    expect(customer.to).toBe("jane@example.com");
    expect(customer.html).toContain("Your class is booked!");
    expect(customer.html).toContain("Tuesday, 9 June 2026");
    expect(customer.html).toContain("Studio 1, Hove");
    expect(customer.html).toContain("£15.00");
    expect(admin.subject).toBe("[Moontide] New booking: Prenatal Yoga");
    expect(admin.text).toContain("Paid: £15.00");
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ emailSent: true, emailLastError: null }),
    );
  });

  it("resends a credit booking as a credit, not as a price", async () => {
    queue({ ...BOOKING_ROW, bundles: { id: 5, creditsRemaining: 2 } });

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(200);
    const [customer, admin] = inbox.sent;
    expect(customer.html).toContain("1 class credit from your bundle");
    expect(customer.html).toContain("2 classes");
    expect(customer.html).not.toContain("£");
    expect(admin.text).toContain("Paid: bundle credit (2 classes left)");
  });

  it("resends the moved-date note to a booking that owes one", async () => {
    // Sending a plain confirmation here — and then marking the row sent — took
    // the note out of the overnight sweep, and nothing ever sent it.
    queue({
      ...BOOKING_ROW,
      bookings: { ...BOOKING_ROW.bookings, emailKind: "reschedule" },
      original_schedules: {
        date: "2026-05-02",
        startTime: "09:00:00",
        endTime: "10:00:00",
      },
    });

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(200);
    // The moved-date note, and only that: no plain confirmation beside it.
    expect(inbox.sent).toHaveLength(1);
    expect(inbox.sent[0].subject).toBe(
      "Your booking has been moved — Prenatal Yoga",
    );
    expect(inbox.sent[0].html).toContain(
      "Saturday, 2 May 2026, 09:00:00–10:00:00",
    );
    expect(inbox.sent[0].html).toContain(
      "Tuesday, 9 June 2026, 10:00:00–11:00:00",
    );
  });

  it("refuses a notification kind it does not know how to send", async () => {
    queue({
      ...BOOKING_ROW,
      bookings: { ...BOOKING_ROW.bookings, emailKind: "postcard" },
    });

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        'This booking is owed a "postcard" email, which is not one this can send',
    });
    expect(inbox.sent).toEqual([]);
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("returns 404 when the booking is gone", async () => {
    queue();

    const response = await POST(request({ type: "booking", id: 999 }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Booking not found" });
    expect(inbox.sent).toEqual([]);
  });

  it("resends a booking whose flag already says it was sent", async () => {
    // The flag is what Gabrielle is disputing when a customer tells her nothing
    // arrived, so it can never be the reason the resend is refused.
    queue({
      ...BOOKING_ROW,
      bookings: { ...BOOKING_ROW.bookings, emailSent: true, emailAttempts: 1 },
    });

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(200);
    expect(inbox.to("jane@example.com")).toHaveLength(1);
  });

  it("records the failure and says so when the send throws", async () => {
    inbox.failWhen((message) => message.to === "jane@example.com");

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error:
        "The email could not be sent. It has been recorded as unsent and the overnight retry will try again.",
    });
    // The attempt is counted and the reason kept, and the row is not marked sent.
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailLastError: "Refused to send to jane@example.com",
      }),
    );
    expect(mockUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ emailSent: true }),
    );
  });

  it("refuses a held seat — nobody has taken that offer up yet", async () => {
    queue({
      ...BOOKING_ROW,
      bookings: { ...BOOKING_ROW.bookings, status: "held" },
    });

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This seat is being held, not booked",
    });
    expect(inbox.sent).toEqual([]);
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/resend-email — a bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    queue(BUNDLE_ROW);
  });

  it("names the product the purchase recorded, not one with matching credits", async () => {
    const response = await POST(request({ type: "bundle", id: 5 }));

    expect(response.status).toBe(200);
    // The join is on the recorded config, so two configs selling six classes
    // can no longer be confused for one another.
    expect(mockEq).toHaveBeenCalledWith(
      "bundles.bundle_config_id",
      "bundle_config.id",
    );
    const [customer, admin] = inbox.sent;
    expect(customer.to).toBe("jane@example.com");
    expect(customer.subject).toBe("Your 6-Class Bundle is ready — Moontide");
    expect(customer.html).toContain("1 Dec 2026");
    expect(admin.subject).toBe("[Moontide] New bundle purchase");
    expect(admin.text).toContain("Bundle: 6-Class Bundle");
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ emailSent: true, emailLastError: null }),
    );
  });

  it("refuses a bundle whose product has been deleted, rather than 404ing it", async () => {
    // A left join, so the payment still comes back — it is the product that is
    // missing, and saying "bundle not found" about a bundle that is right there
    // sends Gabrielle looking for the wrong thing.
    queue({ ...BUNDLE_ROW, bundle_config: null });

    const response = await POST(request({ type: "bundle", id: 5 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "This bundle's product has been deleted, so there is nothing to name in the confirmation",
    });
    expect(inbox.sent).toEqual([]);
  });

  it("returns 404 when the bundle is gone", async () => {
    queue();

    const response = await POST(request({ type: "bundle", id: 999 }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Bundle not found" });
    expect(inbox.sent).toEqual([]);
  });
});

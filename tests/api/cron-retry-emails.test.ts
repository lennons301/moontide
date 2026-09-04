import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The retry sweep as the cron handler runs it. What it is defending against:
 * a row that nobody has been told about staying that way. So the tests here are
 * about which rows are picked up (all of them, whatever their age), what happens
 * to the ones deliberately left, and that one row failing does not take the rest
 * of the run with it.
 */

const { queueSelects, mockSelect, mockUpdateSet, mockRunDailyOfferWork } =
  vi.hoisted(() => {
    // Each `select()` takes the next queued result, and every step of its chain
    // resolves to it — so a query that stops at a join reads the same way as one
    // that goes on to filter or group.
    const results: unknown[][] = [];
    const queueSelects = (...rows: unknown[][]) => {
      results.length = 0;
      results.push(...rows);
    };
    const chain = () => {
      const rows = results.shift() ?? [];
      const node: Promise<unknown[]> = Promise.resolve(rows);
      return Object.assign(node, {
        innerJoin: vi.fn(() => node),
        leftJoin: vi.fn(() => node),
        where: vi.fn(() => node),
        groupBy: vi.fn(() => node),
        orderBy: vi.fn(() => node),
      });
    };
    const mockSelect = vi.fn(() => ({ from: vi.fn(() => chain()) }));

    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });

    return {
      queueSelects,
      mockSelect,
      mockUpdateSet,
      mockRunDailyOfferWork: vi.fn().mockResolvedValue({
        expiredOffers: { found: 0, released: 0, emailed: 0, failed: 0 },
        digest: { sent: false, items: 0 },
      }),
    };
  });

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: {
    id: "bookings.id",
    emailSent: "bookings.email_sent",
    emailKind: "bookings.email_kind",
    emailAttempts: "bookings.email_attempts",
    createdAt: "bookings.created_at",
    scheduleId: "bookings.schedule_id",
    originalScheduleId: "bookings.original_schedule_id",
    status: "bookings.status",
    bundleId: "bookings.bundle_id",
  },
  bundles: {
    id: "bundles.id",
    emailSent: "bundles.email_sent",
    emailAttempts: "bundles.email_attempts",
    bundleConfigId: "bundles.bundle_config_id",
    purchasedAt: "bundles.purchased_at",
    creditsTotal: "bundles.credits_total",
  },
  bundleConfig: { id: "bundle_config.id", credits: "bundle_config.credits" },
  schedules: { id: "schedules.id", classId: "schedules.class_id" },
  classes: { id: "classes.id" },
  waitlistEntries: {
    id: "waitlist_entries.id",
    scheduleId: "waitlist_entries.schedule_id",
    emailSent: "waitlist_entries.email_sent",
    emailAttempts: "waitlist_entries.email_attempts",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((...args: unknown[]) => args),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((table: unknown) => table),
}));

// The daily offer work is folded into this handler; what it does is covered in
// tests/api/cron-offer-sweep.test.ts. Here it is only wiring.
vi.mock("@/lib/waitlist/daily", () => ({
  runDailyOfferWork: mockRunDailyOfferWork,
}));

import { gte, ne } from "drizzle-orm";
import { POST } from "@/app/api/cron/retry-emails/route";
import type { InMemoryEmails } from "@/lib/notifications/in-memory-adapter";
import {
  givenEmailsCollected,
  resetEmailAdapter,
} from "../support/notifications";

/**
 * The sweep sends through the real notification module, against the in-memory
 * transport — what a retry is for is the email arriving, so that is what these
 * read back.
 */
let inbox: InMemoryEmails;

const DAY_MS = 24 * 60 * 60 * 1000;

/** A London date `days` from now, as a schedule stores it. */
function isoDate(days: number) {
  return new Date(Date.now() + days * DAY_MS).toISOString().split("T")[0];
}

function authorized(secret = "test-secret") {
  return new Request("http://localhost:3000/api/cron/retry-emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
}

/** One unsent booking as the sweep's join returns it. */
function pendingBooking(overrides: Record<string, unknown> = {}) {
  return {
    bookings: {
      id: 1,
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      stripePaymentId: "cs_test_1",
      bundleId: null,
      emailKind: "confirmation",
      // Created three days ago: outside the window the sweep used to have.
      createdAt: new Date(Date.now() - 3 * DAY_MS),
    },
    schedules: {
      date: isoDate(7),
      startTime: "09:00",
      endTime: "10:00",
      location: "Studio 1",
    },
    classes: { title: "Prenatal Yoga", priceInPence: 1250 },
    // The bundle the booking was funded from, if any: a left join, so null for
    // a card booking.
    bundles: null,
    // The class it was moved off, if any — the same left join.
    original_schedules: null,
    ...overrides,
  };
}

/** One unsent bundle as the sweep's join returns it. */
function pendingBundle(overrides: Record<string, unknown> = {}) {
  return {
    bundles: {
      id: 7,
      customerEmail: "jane@example.com",
      creditsTotal: 6,
      bundleConfigId: 2,
      expiresAt: new Date(Date.now() + 30 * DAY_MS),
    },
    bundle_config: { id: 2, name: "6× Prenatal", credits: 6 },
    ...overrides,
  };
}

/**
 * The sweep's reads in order: every booking that owes a notification (both kinds
 * in one read, so a kind it does not recognise is a row it has in its hand),
 * bundle confirmations, then waiting-list confirmations. The waiting-list count
 * query only runs when there is a waiting-list entry to send to.
 */
function queueSweep(options: {
  bookings?: unknown[];
  bundles?: unknown[];
  waitlist?: unknown[];
  waitlistCounts?: unknown[];
}) {
  queueSelects(
    options.bookings ?? [],
    options.bundles ?? [],
    options.waitlist ?? [],
    options.waitlistCounts ?? [],
  );
}

describe("POST /api/cron/retry-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    process.env.CONTACT_EMAIL = "gabrielle@example.com";
    process.env.BETTER_AUTH_URL = "https://gabriellemoontide.co.uk";
    queueSweep({});
    inbox = givenEmailsCollected();
    mockUpdateSet.mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
  });

  afterEach(resetEmailAdapter);

  it("returns 401 without valid authorization", async () => {
    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(mockRunDailyOfferWork).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong secret", async () => {
    const response = await POST(authorized("wrong-secret"));
    expect(response.status).toBe(401);
  });

  it("returns 200 with a summary when nothing is owing", async () => {
    const response = await POST(authorized());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      succeeded: 0,
      failed: 0,
      skipped: 0,
    });
  });

  it("runs the daily offer work too", async () => {
    // Only daily schedules are permitted here, so the offer sweep and digest
    // ride along with the daily run that already exists.
    const response = await POST(authorized());

    expect(mockRunDailyOfferWork).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({
      expiredOffers: { found: 0 },
      digest: { sent: false },
    });
  });

  describe("booking confirmations", () => {
    it("retries one and records it sent", async () => {
      queueSweep({ bookings: [pendingBooking()] });

      const response = await POST(authorized());
      expect(response.status).toBe(200);

      const [customer, admin] = inbox.sent;
      expect(customer.to).toBe("jane@example.com");
      expect(customer.subject).toBe(
        "Your Prenatal Yoga class is booked — Moontide",
      );
      expect(customer.html).toContain("Studio 1");
      expect(customer.html).toContain("£12.50");
      expect(admin.to).toBe("gabrielle@example.com");
      expect(admin.text).toContain("Paid: £12.50");
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ emailSent: true, emailLastError: null }),
      );
      expect(await response.json()).toMatchObject({ succeeded: 1, skipped: 0 });
    });

    it("takes a row older than the day the window used to allow", async () => {
      // The old sweep bounded itself to rows created in the last 24 hours while
      // the cron ran once a day: a row that aged past the window between runs
      // was never retried and never reported. Nothing bounds it by age now.
      queueSweep({
        bookings: [
          pendingBooking({
            bookings: {
              ...pendingBooking().bookings,
              createdAt: new Date(Date.now() - 40 * DAY_MS),
            },
          }),
        ],
      });

      const response = await POST(authorized());

      expect(inbox.to("jane@example.com")).toHaveLength(1);
      expect(await response.json()).toMatchObject({ succeeded: 1 });
      // And no filter on when the row was created — of any kind.
      expect(vi.mocked(gte)).not.toHaveBeenCalled();
    });

    it("leaves a class that has already happened, and says it did", async () => {
      // Confirming a class that has been and gone tells the customer nothing
      // they can use. The row keeps its unsent flag, so it still shows in the
      // admin with the resend button beside it.
      queueSweep({
        bookings: [
          pendingBooking({
            schedules: { ...pendingBooking().schedules, date: isoDate(-2) },
          }),
        ],
      });

      const response = await POST(authorized());

      expect(inbox.sent).toEqual([]);
      expect(mockUpdateSet).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({ succeeded: 0, skipped: 1 });
    });

    it("carries on when one row's send fails, and records why", async () => {
      // The first row the sweep reaches, and only that one.
      let firstSend = true;
      inbox.failWhen(() => {
        const fail = firstSend;
        firstSend = false;
        return fail;
      });
      queueSweep({
        bookings: [
          pendingBooking(),
          pendingBooking({
            bookings: { ...pendingBooking().bookings, id: 2 },
          }),
        ],
      });

      const response = await POST(authorized());

      // The second row is still sent, and the first carries its reason.
      expect(inbox.to("jane@example.com")).toHaveLength(1);
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          emailLastError: "Refused to send to jane@example.com",
        }),
      );
      expect(await response.json()).toMatchObject({ succeeded: 1, failed: 1 });
    });

    it("never quotes a price for a booking funded by a bundle credit", async () => {
      // The sweep used to send every unsent booking the card confirmation, so a
      // credit booking it picked up was emailed money it never paid.
      queueSweep({
        bookings: [pendingBooking({ bundles: { id: 9, creditsRemaining: 2 } })],
      });

      await POST(authorized());

      const [customer, admin] = inbox.sent;
      expect(customer.html).toContain("1 class credit from your bundle");
      expect(customer.html).toContain("2 classes");
      expect(customer.html).not.toContain("£");
      expect(admin.text).toContain("Paid: bundle credit (2 classes left)");
    });

    it("leaves out the bookings the email would no longer be true of", async () => {
      await POST(authorized());

      // Nobody has taken a held seat up, so confirming it would tell them their
      // class is booked when it is not; a cancelled or released booking holds no
      // place, and an unbounded sweep is exactly what would otherwise turn one
      // of those into a confirmation months later.
      for (const status of ["held", "cancelled", "released"]) {
        expect(vi.mocked(ne)).toHaveBeenCalledWith("bookings.status", status);
      }
    });
  });

  it("counts and names a booking owing a notification it cannot send", async () => {
    // `emailKind` is text, so a third value is possible. Both kinds come back in
    // one read precisely so this row is one the sweep has in its hand: it is
    // reported rather than matching no query and being counted nowhere.
    queueSweep({
      bookings: [
        pendingBooking({
          bookings: { ...pendingBooking().bookings, emailKind: "postcard" },
        }),
      ],
    });

    const response = await POST(authorized());

    expect(inbox.sent).toEqual([]);
    expect(await response.json()).toMatchObject({
      skipped: 1,
      retries: { unrecognised: { skipped: 1 } },
    });
  });

  describe("bundle confirmations", () => {
    it("names the product the purchase recorded", async () => {
      queueSweep({ bundles: [pendingBundle()] });

      const response = await POST(authorized());

      const [customer, admin] = inbox.sent;
      expect(customer.to).toBe("jane@example.com");
      expect(customer.subject).toBe("Your 6× Prenatal is ready — Moontide");
      expect(customer.html).toContain("6 classes");
      expect(admin.text).toContain("Bundle: 6× Prenatal");
      expect(await response.json()).toMatchObject({ succeeded: 1 });
    });

    it("leaves a bundle whose product has been deleted, and says it did", async () => {
      // The join is a left one, so the row comes back rather than vanishing;
      // there is simply no product to name in the email.
      queueSweep({ bundles: [pendingBundle({ bundle_config: null })] });

      const response = await POST(authorized());

      expect(inbox.sent).toEqual([]);
      expect(await response.json()).toMatchObject({ skipped: 1 });
    });

    it("leaves a bundle that has already expired", async () => {
      queueSweep({
        bundles: [
          pendingBundle({
            bundles: {
              ...pendingBundle().bundles,
              expiresAt: new Date(Date.now() - DAY_MS),
            },
          }),
        ],
      });

      const response = await POST(authorized());

      expect(inbox.sent).toEqual([]);
      expect(await response.json()).toMatchObject({ skipped: 1 });
    });

    it("carries on when one bundle's send fails", async () => {
      let firstSend = true;
      inbox.failWhen(() => {
        const fail = firstSend;
        firstSend = false;
        return fail;
      });
      queueSweep({
        bundles: [
          pendingBundle(),
          pendingBundle({ bundles: { ...pendingBundle().bundles, id: 8 } }),
        ],
      });

      const response = await POST(authorized());

      expect(inbox.to("jane@example.com")).toHaveLength(1);
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          emailLastError: "Refused to send to jane@example.com",
        }),
      );
      expect(await response.json()).toMatchObject({ succeeded: 1, failed: 1 });
    });
  });

  describe("reschedule notifications", () => {
    const rescheduled = {
      bookings: {
        id: 3,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        bundleId: null,
        originalScheduleId: 41,
        emailKind: "reschedule",
      },
      schedules: {
        date: isoDate(9),
        startTime: "18:00",
        endTime: "19:00",
        location: "Studio 2",
      },
      classes: { title: "Prenatal Yoga", priceInPence: 1250 },
      bundles: null,
      original_schedules: {
        date: isoDate(2),
        startTime: "09:00",
        endTime: "10:00",
      },
    };

    it("retries the moved-date note the move failed to send", async () => {
      queueSweep({ bookings: [rescheduled] });

      const response = await POST(authorized());

      // The note, and only the note: no confirmation, and nothing to Gabrielle.
      expect(inbox.sent).toHaveLength(1);
      expect(inbox.sent[0].to).toBe("jane@example.com");
      expect(inbox.sent[0].subject).toBe(
        "Your booking has been moved — Prenatal Yoga",
      );
      expect(inbox.sent[0].html).toContain("18:00–19:00");
      expect(inbox.sent[0].html).toContain("09:00–10:00");
      expect(await response.json()).toMatchObject({ succeeded: 1 });
    });

    it("sends a plain confirmation when the class they moved off is gone", async () => {
      // There is no "from" to name, and failing nightly for ever on a deleted
      // class would tell the customer nothing at all.
      queueSweep({
        bookings: [{ ...rescheduled, original_schedules: null }],
      });

      const response = await POST(authorized());

      expect(inbox.sent[0].subject).toBe(
        "Your Prenatal Yoga class is booked — Moontide",
      );
      expect(inbox.sent[0].html).not.toContain("has been moved");
      expect(await response.json()).toMatchObject({ succeeded: 1 });
    });
  });

  describe("waiting-list confirmations", () => {
    const waiting = {
      waitlist_entries: {
        id: 4,
        scheduleId: 42,
        customerName: "Ada Fields",
        customerEmail: "ada@example.com",
      },
      schedules: {
        date: isoDate(4),
        startTime: "09:00",
        endTime: "10:00",
        location: "Studio 1",
      },
      classes: { title: "Prenatal Yoga" },
    };

    it("retries one, with the waiting list as it stands now", async () => {
      // The flag on a waiting-list entry was written once and read by nothing,
      // so a confirmation that failed to send was lost to everyone.
      queueSweep({
        waitlist: [waiting],
        waitlistCounts: [{ scheduleId: 42, count: 3 }],
      });

      const response = await POST(authorized());

      const [customer, admin] = inbox.sent;
      expect(customer.to).toBe("ada@example.com");
      expect(customer.subject).toBe(
        "You're on the waiting list — Prenatal Yoga",
      );
      expect(admin.text).toContain(
        "There are now 3 people on the waiting list",
      );
      expect(await response.json()).toMatchObject({ succeeded: 1 });
    });

    it("leaves an entry whose class has already happened", async () => {
      queueSweep({
        waitlist: [
          {
            ...waiting,
            schedules: { ...waiting.schedules, date: isoDate(-1) },
          },
        ],
        waitlistCounts: [{ scheduleId: 42, count: 3 }],
      });

      const response = await POST(authorized());

      expect(inbox.sent).toEqual([]);
      expect(await response.json()).toMatchObject({ skipped: 1 });
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The daily offer work as the cron handler runs it: settling offers nobody
 * answered, and the digest that prompts Gabrielle. Which entries belong in which
 * digest section — and when the digest is suppressed — is tested against the
 * pure seam in tests/lib/waitlist-digest.test.ts.
 */

const {
  queueSelects,
  selectFilters,
  mockSelect,
  mockTransaction,
  mockUpdateSet,
  mockDeleteReturning,
  mockDeleteWhere,
  mockReleaseSeat,
  mockNotify,
} = vi.hoisted(() => {
  // Each `select()` takes the next queued result, and every step of its chain
  // resolves to it — so a query that stops at a join reads the same way as one
  // that goes on to filter, group or order.
  const results: unknown[][] = [];
  // What each select filtered on, in the order the handler ran them. A mocked
  // read answers with whatever it is handed, so the rows a query would actually
  // have matched are only visible here, in its WHERE.
  const selectFilters: unknown[][] = [];
  const queueSelects = (...rows: unknown[][]) => {
    results.length = 0;
    results.push(...rows);
    selectFilters.length = 0;
  };
  const chain = () => {
    const rows = results.shift() ?? [];
    const filters: unknown[] = [];
    selectFilters.push(filters);
    const node: Promise<unknown[]> = Promise.resolve(rows);
    return Object.assign(node, {
      innerJoin: vi.fn(() => node),
      leftJoin: vi.fn(() => node),
      where: vi.fn((condition: unknown) => {
        filters.push(condition);
        return node;
      }),
      orderBy: vi.fn(() => node),
      groupBy: vi.fn(() => node),
    });
  };
  const mockSelect = vi.fn(() => ({ from: vi.fn(() => chain()) }));

  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockDeleteReturning = vi.fn().mockResolvedValue([{ id: 900 }]);
  const mockDeleteWhere = vi
    .fn()
    .mockReturnValue({ returning: mockDeleteReturning });
  const mockTransaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({
        update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
        delete: vi.fn().mockReturnValue({ where: mockDeleteWhere }),
      }),
  );

  const mockReleaseSeat = vi.fn().mockResolvedValue(undefined);
  const mockNotify = vi.fn().mockResolvedValue({ ok: true });

  return {
    queueSelects,
    selectFilters,
    mockSelect,
    mockTransaction,
    mockUpdateSet,
    mockDeleteReturning,
    mockDeleteWhere,
    mockReleaseSeat,
    mockNotify,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    transaction: mockTransaction,
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: {
    id: "id",
    scheduleId: "schedule_id",
    status: "status",
    emailSent: "email_sent",
    createdAt: "created_at",
    customerName: "customer_name",
    customerEmail: "customer_email",
    releasedAt: "released_at",
  },
  bundles: {
    id: "id",
    emailSent: "email_sent",
    purchasedAt: "purchased_at",
    creditsTotal: "credits_total",
  },
  bundleConfig: { id: "id", credits: "credits" },
  schedules: {
    id: "id",
    classId: "class_id",
    date: "date",
    startTime: "start_time",
    endTime: "end_time",
    capacity: "capacity",
    bookedCount: "booked_count",
    status: "status",
  },
  classes: { id: "id", title: "title" },
  waitlistEntries: {
    id: "id",
    scheduleId: "schedule_id",
    customerName: "customer_name",
    customerEmail: "customer_email",
    offerExpiresAt: "offer_expires_at",
    heldBookingId: "held_booking_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
  isNotNull: vi.fn((...args: unknown[]) => args),
  lte: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((...args: unknown[]) => args),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((table: unknown) => table),
}));

vi.mock("@/lib/schedule-occupancy", () => ({
  releaseSeat: mockReleaseSeat,
  releaseSeats: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({ notify: mockNotify }));

/** The events of one kind this run raised, most recent last. */
function raised(type: string) {
  return mockNotify.mock.calls.filter(([event]) => event.type === type);
}

import { and, gte, ne } from "drizzle-orm";
import { POST } from "@/app/api/cron/retry-emails/route";
import { schedules } from "@/lib/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A London date `days` from now, as a schedule stores it. */
function isoDate(days: number) {
  return new Date(Date.now() + days * DAY_MS).toISOString().split("T")[0];
}

const EXPIRED_OFFER = {
  entryId: 5,
  scheduleId: 42,
  heldBookingId: 900,
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  classTitle: "Prenatal Yoga",
  date: isoDate(3),
  startTime: "10:00:00",
  endTime: "11:00:00",
};

/**
 * The handler's reads in order: the three retry sweeps (booking notifications,
 * bundle confirmations, waiting-list confirmations), then expired offers, then
 * the digest's schedules, waiting-list entries and released bookings.
 */
function queueRun(options: {
  expiredOffers?: unknown[];
  schedules?: unknown[];
  entries?: unknown[];
  released?: unknown[];
}) {
  queueSelects(
    [],
    [],
    [],
    options.expiredOffers ?? [],
    options.schedules ?? [],
    options.entries ?? [],
    options.released ?? [],
  );
}

function cronRequest(secret = "test-secret") {
  return new Request("http://localhost:3000/api/cron/retry-emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
}

describe("daily offer work in POST /api/cron/retry-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockDeleteReturning.mockResolvedValue([{ id: 900 }]);
    mockNotify.mockResolvedValue({ ok: true });
    queueRun({});
  });

  describe("settling offers nobody answered", () => {
    it("frees the seat and tells the person once", async () => {
      queueRun({ expiredOffers: [EXPIRED_OFFER] });

      const response = await POST(cronRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        expiredOffers: { found: 1, released: 1, emailed: 1, failed: 0 },
      });

      expect(mockReleaseSeat).toHaveBeenCalledOnce();
      expect(mockReleaseSeat.mock.calls[0][1]).toBe(42);
      expect(raised("offer-expired")).toEqual([
        [
          {
            type: "offer-expired",
            customerName: "Jane Doe",
            customerEmail: "jane@example.com",
            classTitle: "Prenatal Yoga",
            date: EXPIRED_OFFER.date,
            startTime: "10:00:00",
            endTime: "11:00:00",
          },
          // The offer is gone, so nothing is left for a retry to be true to.
          { notRecorded: expect.any(String) },
        ],
      ]);
    });

    it("leaves the person on the waiting list, minus the offer", async () => {
      queueRun({ expiredOffers: [EXPIRED_OFFER] });

      await POST(cronRequest());

      // The same state a withdrawal reaches: the entry keeps its place and only
      // the offer is stripped off it. Only the held booking is deleted.
      expect(mockUpdateSet).toHaveBeenCalledWith({
        offeredAt: null,
        offerExpiresAt: null,
        offerToken: null,
        heldBookingId: null,
      });
      expect(mockDeleteWhere).toHaveBeenCalledOnce();
    });

    it("says nothing to someone whose seat was taken up in the meantime", async () => {
      // The guarded delete matched nothing: that booking is a real one now.
      mockDeleteReturning.mockResolvedValue([]);
      queueRun({ expiredOffers: [EXPIRED_OFFER] });

      const response = await POST(cronRequest());

      expect(await response.json()).toMatchObject({
        expiredOffers: { found: 1, released: 0, emailed: 0, failed: 0 },
      });
      expect(mockReleaseSeat).not.toHaveBeenCalled();
      expect(raised("offer-expired")).toEqual([]);
    });

    it("carries on when one offer fails", async () => {
      mockNotify
        .mockResolvedValueOnce({
          ok: false,
          error: new Error("Resend is down"),
        })
        .mockResolvedValue({ ok: true });
      queueRun({
        expiredOffers: [
          EXPIRED_OFFER,
          { ...EXPIRED_OFFER, entryId: 6, heldBookingId: 901 },
        ],
      });

      const response = await POST(cronRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        expiredOffers: { found: 2, released: 2, emailed: 1, failed: 1 },
      });
    });

    it("does none of it without the cron secret", async () => {
      queueRun({ expiredOffers: [EXPIRED_OFFER] });

      const response = await POST(cronRequest("wrong-secret"));

      expect(response.status).toBe(401);
      expect(mockReleaseSeat).not.toHaveBeenCalled();
      expect(mockNotify).not.toHaveBeenCalled();
    });
  });

  describe("the digest", () => {
    it("is not sent when nothing needs her", async () => {
      const response = await POST(cronRequest());

      expect(raised("daily-digest")).toEqual([]);
      expect(await response.json()).toMatchObject({
        digest: { sent: false, items: 0 },
      });
    });

    it("reports a free seat that people are waiting for", async () => {
      queueRun({
        schedules: [
          {
            scheduleId: 42,
            classTitle: "Prenatal Yoga",
            date: isoDate(5),
            startTime: "10:00:00",
            endTime: "11:00:00",
            status: "open",
            capacity: 8,
            bookedCount: 7,
          },
        ],
        entries: [
          {
            scheduleId: 42,
            customerName: "Jane Doe",
            customerEmail: "jane@example.com",
            offerExpiresAt: null,
            heldBookingId: null,
            heldBookingStatus: null,
          },
        ],
      });

      const response = await POST(cronRequest());

      expect(await response.json()).toMatchObject({
        digest: { sent: true, items: 1 },
      });
      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "daily-digest",
          digest: expect.objectContaining({
            seatsToOffer: [
              expect.objectContaining({
                scheduleId: 42,
                classTitle: "Prenatal Yoga",
                freeSeats: 1,
                waitingCount: 1,
              }),
            ],
            offersOutstanding: [],
            owedAClass: [],
          }),
        }),
        expect.anything(),
      );
    });

    it("reports an outstanding offer with its deadline", async () => {
      const expiresAt = new Date(Date.now() + DAY_MS);
      queueRun({
        schedules: [
          {
            scheduleId: 42,
            classTitle: "Prenatal Yoga",
            date: isoDate(5),
            startTime: "10:00:00",
            endTime: "11:00:00",
            status: "open",
            capacity: 8,
            bookedCount: 8,
          },
        ],
        entries: [
          {
            scheduleId: 42,
            customerName: "Jane Doe",
            customerEmail: "jane@example.com",
            offerExpiresAt: expiresAt,
            heldBookingId: 900,
            heldBookingStatus: "held",
          },
        ],
      });

      await POST(cronRequest());

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "daily-digest",
          digest: expect.objectContaining({
            seatsToOffer: [],
            offersOutstanding: [
              expect.objectContaining({
                customerName: "Jane Doe",
                customerEmail: "jane@example.com",
                expiresAt,
              }),
            ],
          }),
        }),
        expect.anything(),
      );
    });

    // Closing a class does not retire the offers already made on it, so the
    // read that feeds the digest cannot narrow to open classes: that would take
    // the outstanding section down with the seats one.
    it("reports an outstanding offer on a class she has since closed", async () => {
      const expiresAt = new Date(Date.now() + DAY_MS);
      queueRun({
        schedules: [
          {
            scheduleId: 42,
            classTitle: "Prenatal Yoga",
            date: isoDate(5),
            startTime: "10:00:00",
            endTime: "11:00:00",
            status: "closed",
            capacity: 8,
            // A seat free beside the held one: the prompt to offer it is what
            // closing suppresses, and only that.
            bookedCount: 7,
          },
        ],
        entries: [
          {
            scheduleId: 42,
            customerName: "Jane Doe",
            customerEmail: "jane@example.com",
            offerExpiresAt: expiresAt,
            heldBookingId: 900,
            heldBookingStatus: "held",
          },
          {
            scheduleId: 42,
            customerName: "Amy Bell",
            customerEmail: "amy@example.com",
            offerExpiresAt: null,
            heldBookingId: null,
            heldBookingStatus: null,
          },
        ],
      });

      await POST(cronRequest());

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "daily-digest",
          digest: expect.objectContaining({
            seatsToOffer: [],
            offersOutstanding: [
              expect.objectContaining({
                customerName: "Jane Doe",
                expiresAt,
              }),
            ],
          }),
        }),
        expect.anything(),
      );
    });

    // The rows a mocked read answers with are whatever the test handed it, so
    // the only place a narrowed query would show is its WHERE.
    it("does not filter the digest's classes down to the open ones", async () => {
      queueRun({});

      await POST(cronRequest());

      // The handler's reads in order (see `queueRun`): three retry sweeps, the
      // expired offers, then the digest's schedules.
      const [filter] = selectFilters[4];
      expect(filter).toEqual(
        and(
          gte(schedules.date, expect.any(String)),
          ne(schedules.status, "cancelled"),
        ),
      );
    });

    it("reports a card payer released more than a week ago", async () => {
      queueRun({
        released: [
          {
            bookingId: 7,
            customerName: "Priya Shah",
            customerEmail: "priya@example.com",
            classTitle: "Vinyasa",
            date: isoDate(-30),
            releasedAt: new Date(Date.now() - 30 * DAY_MS),
          },
        ],
      });

      await POST(cronRequest());

      expect(mockNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "daily-digest",
          digest: expect.objectContaining({
            owedAClass: [
              expect.objectContaining({ bookingId: 7, daysSince: 30 }),
            ],
          }),
        }),
        expect.anything(),
      );
    });

    it("does not take the handler down when the send fails", async () => {
      mockNotify.mockResolvedValue({
        ok: false,
        error: new Error("Resend is down"),
      });
      queueRun({
        released: [
          {
            bookingId: 7,
            customerName: "Priya Shah",
            customerEmail: "priya@example.com",
            classTitle: "Vinyasa",
            date: isoDate(-30),
            releasedAt: new Date(Date.now() - 30 * DAY_MS),
          },
        ],
      });

      const response = await POST(cronRequest());

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ digest: null });
    });
  });
});

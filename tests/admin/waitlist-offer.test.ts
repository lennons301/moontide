import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Thin wiring cover for the offer routes. The rules themselves — deadlines,
 * the offers-cannot-exceed-free-seats invariant, the duplicate-check bypass —
 * are tested against the pure seam in tests/lib/waitlist-offers.test.ts.
 */

const {
  queueResults,
  mockSelect,
  mockInsertValues,
  mockInsertReturning,
  mockUpdateSet,
  mockDeleteWhere,
  mockDeleteReturning,
  mockTransaction,
  mockClaimSeat,
  mockReleaseSeat,
  mockSendSeatOffer,
  mockAfter,
} = vi.hoisted(() => {
  // Each `select()` chain resolves to the next queued result, whether it ends
  // in `.where()` or `.where().orderBy()`.
  const results: unknown[][] = [];
  const queueResults = (...rows: unknown[][]) => {
    results.length = 0;
    results.push(...rows);
  };
  // The queue is consumed when `where()` is called, so the chain works whether
  // the caller awaits it directly or goes on to `.orderBy()`.
  const selectWhere = vi.fn(() => {
    const rows = results.shift() ?? [];
    return Object.assign(Promise.resolve(rows), {
      orderBy: vi.fn(() => Promise.resolve(rows)),
    });
  });
  const innerJoin = vi.fn().mockReturnValue({ where: selectWhere });
  const leftJoin = vi.fn().mockReturnValue({ where: selectWhere });
  const from = vi
    .fn()
    .mockReturnValue({ where: selectWhere, innerJoin, leftJoin });
  const mockSelect = vi.fn().mockReturnValue({ from });

  const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 900 }]);
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockInsertReturning });
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockDeleteReturning = vi.fn().mockResolvedValue([{ id: 900 }]);
  const mockDeleteWhere = vi
    .fn()
    .mockReturnValue({ returning: mockDeleteReturning });

  const mockTransaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({
        insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
        update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
        delete: vi.fn().mockReturnValue({ where: mockDeleteWhere }),
      }),
  );

  const mockClaimSeat = vi.fn().mockResolvedValue({ claimed: true });
  const mockReleaseSeat = vi.fn().mockResolvedValue(undefined);
  const mockSendSeatOffer = vi.fn().mockResolvedValue({ success: true });
  const mockAfter = vi.fn((fn: () => Promise<void> | void) => fn());

  return {
    queueResults,
    mockSelect,
    mockInsertValues,
    mockInsertReturning,
    mockUpdateSet,
    mockDeleteWhere,
    mockDeleteReturning,
    mockTransaction,
    mockClaimSeat,
    mockReleaseSeat,
    mockSendSeatOffer,
    mockAfter,
  };
});

vi.mock("@/lib/db", () => ({
  db: { select: mockSelect, transaction: mockTransaction },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", scheduleId: "schedule_id", status: "status" },
  classes: { id: "id" },
  schedules: { id: "id", classId: "class_id" },
  waitlistEntries: { id: "id", scheduleId: "schedule_id" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
  eq: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/schedule-occupancy", () => ({
  claimSeat: mockClaimSeat,
  releaseSeat: mockReleaseSeat,
}));

vi.mock("@/lib/email", () => ({ sendSeatOffer: mockSendSeatOffer }));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mockAfter };
});

import { DELETE, POST } from "@/app/api/admin/waitlist/offer/route";

const ENTRY = {
  id: 5,
  scheduleId: 42,
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  offerToken: null,
  offerExpiresAt: null,
  heldBookingId: null,
};

// Far enough ahead that the class has not started, whatever "now" is.
const SCHEDULE_ROW = {
  schedules: {
    id: 42,
    date: "2099-06-20",
    startTime: "10:00:00",
    endTime: "11:00:00",
    capacity: 8,
    bookedCount: 7,
    location: "Studio 1, Hove",
    status: "full",
  },
  classes: { id: 3, title: "Prenatal Yoga" },
};

function offerRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/admin/waitlist/offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/waitlist/offer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClaimSeat.mockResolvedValue({ claimed: true });
    mockInsertReturning.mockResolvedValue([{ id: 900 }]);
    queueResults([ENTRY], [SCHEDULE_ROW], []);
  });

  it("rejects a hold duration that is not on offer", async () => {
    const response = await POST(offerRequest({ entryId: 5, hold: "72h" }));
    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("rejects a missing entry", async () => {
    queueResults([], [], []);
    const response = await POST(offerRequest({ entryId: 999, hold: "24h" }));
    expect(response.status).toBe(404);
    expect(mockClaimSeat).not.toHaveBeenCalled();
  });

  it("holds the seat, records the offer and emails the link", async () => {
    const response = await POST(offerRequest({ entryId: 5, hold: "24h" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);

    // The seat is held by occupying capacity, through the same guarded claim
    // every other booking path uses.
    expect(mockClaimSeat).toHaveBeenCalledOnce();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 42,
        customerEmail: "jane@example.com",
        status: "held",
      }),
    );

    // Offer state goes on the waiting-list entry, not the booking.
    const offerState = mockUpdateSet.mock.calls[0][0];
    expect(offerState.heldBookingId).toBe(900);
    expect(offerState.offerToken).toEqual(expect.any(String));
    expect(offerState.offerToken.length).toBeGreaterThan(20);
    expect(offerState.offerExpiresAt.toISOString()).toBe(body.expiresAt);

    const email = mockSendSeatOffer.mock.calls[0][0];
    expect(email.customerEmail).toBe("jane@example.com");
    expect(email.classTitle).toBe("Prenatal Yoga");
    expect(email.date).toBe("2099-06-20");
    expect(email.offerUrl).toContain(offerState.offerToken);
    expect(email.expiresAt).toEqual(offerState.offerExpiresAt);
  });

  it("refuses when the seat is taken between the read and the claim", async () => {
    mockClaimSeat.mockResolvedValue({ claimed: false });

    const response = await POST(offerRequest({ entryId: 5, hold: "24h" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("There is no free seat to offer on this class");

    // No offer recorded and nobody emailed a link to a seat that is gone.
    expect(mockSendSeatOffer).not.toHaveBeenCalled();
  });

  it("refuses when the class is already full", async () => {
    queueResults(
      [ENTRY],
      [
        {
          ...SCHEDULE_ROW,
          schedules: { ...SCHEDULE_ROW.schedules, bookedCount: 8 },
        },
      ],
      [],
    );

    const response = await POST(offerRequest({ entryId: 5, hold: "24h" }));
    expect(response.status).toBe(400);
    expect(mockClaimSeat).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/waitlist/offer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteReturning.mockResolvedValue([{ id: 900 }]);
    queueResults([{ ...ENTRY, heldBookingId: 900 }], [{ status: "held" }]);
  });

  it("frees the seat and clears the offer, leaving the person on the list", async () => {
    const response = await DELETE(
      new Request("http://localhost:3000/api/admin/waitlist/offer?entryId=5", {
        method: "DELETE",
      }),
    );
    expect(response.status).toBe(200);

    expect(mockReleaseSeat).toHaveBeenCalledOnce();
    expect(mockUpdateSet).toHaveBeenCalledWith({
      offeredAt: null,
      offerExpiresAt: null,
      offerToken: null,
      heldBookingId: null,
    });
    // The waiting-list entry itself is untouched — removing them is a separate
    // action, and nothing is sent to the customer.
    expect(mockDeleteWhere).toHaveBeenCalledOnce();
    expect(mockSendSeatOffer).not.toHaveBeenCalled();
  });

  it("does not give a seat back when the offer was taken up first", async () => {
    mockDeleteReturning.mockResolvedValue([]);

    const response = await DELETE(
      new Request("http://localhost:3000/api/admin/waitlist/offer?entryId=5", {
        method: "DELETE",
      }),
    );
    expect(response.status).toBe(200);
    expect(mockReleaseSeat).not.toHaveBeenCalled();
  });

  it("rejects an entry with no offer outstanding", async () => {
    queueResults([ENTRY], []);

    const response = await DELETE(
      new Request("http://localhost:3000/api/admin/waitlist/offer?entryId=5", {
        method: "DELETE",
      }),
    );
    expect(response.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  queueResults,
  mockSelect,
  mockDeleteFrom,
  mockDeleteWhere,
  mockDeleteReturning,
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
  const mockSelectWhere = vi.fn(() => {
    const rows = results.shift() ?? [];
    return Object.assign(Promise.resolve(rows), {
      orderBy: vi.fn(() => Promise.resolve(rows)),
    });
  });
  const mockLeftJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelectFrom = vi
    .fn()
    .mockReturnValue({ where: mockSelectWhere, leftJoin: mockLeftJoin });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
  const mockDeleteReturning = vi.fn().mockResolvedValue([]);
  const mockDeleteWhere = vi
    .fn()
    .mockReturnValue({ returning: mockDeleteReturning });
  const mockDeleteFrom = vi.fn().mockReturnValue({ where: mockDeleteWhere });
  return {
    queueResults,
    mockSelect,
    mockDeleteFrom,
    mockDeleteWhere,
    mockDeleteReturning,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    delete: mockDeleteFrom,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", scheduleId: "schedule_id", status: "status" },
  schedules: {
    id: "id",
    capacity: "capacity",
    bookedCount: "booked_count",
    status: "status",
  },
  waitlistEntries: {
    id: "id",
    scheduleId: "schedule_id",
    createdAt: "created_at",
    heldBookingId: "held_booking_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
}));

import { DELETE, GET } from "@/app/api/admin/waitlist/route";

const JANE = {
  id: 1,
  scheduleId: 42,
  customerName: "Jane",
  customerEmail: "jane@example.com",
  createdAt: "2026-06-01T10:00:00Z",
  offeredAt: null,
  offerExpiresAt: null,
  offerToken: null,
  heldBookingId: null,
};

const JOHN = {
  id: 2,
  scheduleId: 42,
  customerName: "John",
  customerEmail: "john@example.com",
  createdAt: "2026-06-02T11:00:00Z",
  offeredAt: null,
  offerExpiresAt: null,
  offerToken: null,
  heldBookingId: null,
};

const SCHEDULE = { capacity: 8, bookedCount: 8, status: "full" };

function getRequest(query = "?scheduleId=42") {
  return new Request(`http://localhost:3000/api/admin/waitlist${query}`);
}

describe("GET /api/admin/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueResults([], [SCHEDULE], []);
  });

  it("returns 400 when scheduleId is missing", async () => {
    const response = await GET(getRequest(""));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing scheduleId");
  });

  it("returns 400 when scheduleId is not numeric", async () => {
    const response = await GET(getRequest("?scheduleId=abc"));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing scheduleId");
  });

  it("returns entries for the given scheduleId, longest waiting first", async () => {
    queueResults(
      [
        { waitlist_entries: JANE, bookings: null },
        { waitlist_entries: JOHN, bookings: null },
      ],
      [SCHEDULE],
      [],
    );

    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.entries.map((e: { id: number }) => e.id)).toEqual([1, 2]);
    expect(body.entries[0].customerEmail).toBe("jane@example.com");
    expect(body.entries[0].offer).toBeNull();
  });

  it("never exposes the offer token", async () => {
    queueResults(
      [
        {
          waitlist_entries: {
            ...JANE,
            offerToken: "secret-token",
            offeredAt: "2026-06-03T10:00:00Z",
            offerExpiresAt: new Date("2099-06-04T10:00:00Z"),
            heldBookingId: 900,
          },
          bookings: { status: "held" },
        },
      ],
      [SCHEDULE],
      [{ id: 900 }],
    );

    const response = await GET(getRequest());
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("secret-token");
    expect(body.entries[0].offer).toMatchObject({ expired: false });
  });

  it("marks an offer whose deadline has passed as expired", async () => {
    queueResults(
      [
        {
          waitlist_entries: {
            ...JANE,
            offerToken: "secret-token",
            offerExpiresAt: new Date("2020-06-04T10:00:00Z"),
            heldBookingId: 900,
          },
          bookings: { status: "held" },
        },
      ],
      [SCHEDULE],
      [{ id: 900 }],
    );

    const response = await GET(getRequest());
    const body = await response.json();
    expect(body.entries[0].offer.expired).toBe(true);
  });

  it("reports free seats, offers outstanding, and seats nobody is on", async () => {
    queueResults(
      [{ waitlist_entries: JANE, bookings: null }],
      [{ capacity: 8, bookedCount: 8, status: "full" }],
      [{ id: 900 }],
    );

    const response = await GET(getRequest());
    const body = await response.json();
    expect(body.occupancy).toMatchObject({
      capacity: 8,
      freeSeats: 1,
      offersOutstanding: 1,
      seatsWithNobodyOnThem: 0,
      canOffer: false,
    });
  });
});

describe("DELETE /api/admin/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteFrom.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockReturnValue({ returning: mockDeleteReturning });
    mockDeleteReturning.mockResolvedValue([{ id: 1 }]);
    queueResults([JANE]);
  });

  it("returns 400 when id is missing", async () => {
    const request = new Request("http://localhost:3000/api/admin/waitlist", {
      method: "DELETE",
    });
    const response = await DELETE(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing id");
  });

  it("returns 200 when an entry is removed", async () => {
    const request = new Request(
      "http://localhost:3000/api/admin/waitlist?id=1",
      { method: "DELETE" },
    );
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 404 when the entry does not exist", async () => {
    queueResults([]);
    mockDeleteReturning.mockResolvedValue([]);
    const request = new Request(
      "http://localhost:3000/api/admin/waitlist?id=999",
      { method: "DELETE" },
    );
    const response = await DELETE(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Waitlist entry not found");
  });

  it("refuses to remove someone who is holding an offered seat", async () => {
    // Removing them would strand the seat: withdrawing is the separate action.
    queueResults([{ ...JANE, heldBookingId: 900 }], [{ status: "held" }]);

    const request = new Request(
      "http://localhost:3000/api/admin/waitlist?id=1",
      { method: "DELETE" },
    );
    const response = await DELETE(request);
    expect(response.status).toBe(409);
    expect(mockDeleteWhere).not.toHaveBeenCalled();
  });
});

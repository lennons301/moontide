import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

// Hoisted mocks
const {
  mockSelectFrom,
  mockInnerJoin,
  mockOrderBy,
  mockSelectWhere,
  mockSelectRows,
  mockInsertValues,
  mockReturning,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockDeleteFrom,
  mockDeleteWhere,
  mockTransaction,
  mockTxUpdate,
  mockTxUpdateSet,
  queueTxUpdates,
} = vi.hoisted(() => {
  const mockOrderBy = vi.fn().mockResolvedValue([]);
  const mockInnerJoin = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  // Both filtered reads — the capacity guard and the delete guard — await the
  // where() directly, and each takes whatever rows the test put here.
  const mockSelectRows = vi.fn().mockReturnValue([]);
  const mockSelectWhere = vi.fn(() => Promise.resolve(mockSelectRows()));
  const mockSelectFrom = vi.fn().mockReturnValue({
    innerJoin: mockInnerJoin,
    where: mockSelectWhere,
  });
  const mockReturning = vi.fn().mockResolvedValue([
    {
      id: 1,
      classId: 1,
      date: "2026-05-01",
      startTime: "09:00",
      endTime: "10:00",
      capacity: 8,
    },
  ]);
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockReturning });
  const mockUpdateReturning = vi.fn().mockResolvedValue([]);
  const mockUpdateWhere = vi
    .fn()
    .mockReturnValue({ returning: mockUpdateReturning });
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
  const mockDeleteFrom = vi.fn().mockReturnValue({ where: mockDeleteWhere });

  // Writes inside the cancellation transaction, in order: the schedule row, the
  // held bookings it cancelled, then the occupancy release. Each `where()`
  // resolves to the next queued result whether the caller awaits it directly or
  // goes on to `.returning()`.
  const txUpdates: unknown[][] = [];
  const queueTxUpdates = (...rows: unknown[][]) => {
    txUpdates.length = 0;
    txUpdates.push(...rows);
  };
  const mockTxUpdateWhere = vi.fn(() => {
    const rows = txUpdates.shift() ?? [];
    return Object.assign(Promise.resolve(rows), {
      returning: vi.fn().mockResolvedValue(rows),
    });
  });
  const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere });
  const mockTxUpdate = vi.fn().mockReturnValue({ set: mockTxUpdateSet });
  // The delete transaction reads and deletes as well as updating, through the
  // same builders the unwrapped calls use.
  const mockTransaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      await fn({
        update: mockTxUpdate,
        select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
        delete: mockDeleteFrom,
      }),
  );

  return {
    mockSelectFrom,
    mockInnerJoin,
    mockOrderBy,
    mockSelectWhere,
    mockSelectRows,
    mockInsertValues,
    mockReturning,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
    mockDeleteFrom,
    mockDeleteWhere,
    mockTransaction,
    mockTxUpdate,
    mockTxUpdateSet,
    queueTxUpdates,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: mockSelectFrom,
    }),
    insert: vi.fn().mockReturnValue({
      values: mockInsertValues,
    }),
    update: vi.fn().mockReturnValue({
      set: mockUpdateSet,
    }),
    delete: mockDeleteFrom,
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id", active: "active" },
  schedules: { id: "id", classId: "class_id", bookedCount: "booked_count" },
  bookings: { id: "id", scheduleId: "schedule_id", status: "status" },
  waitlistEntries: { id: "id", scheduleId: "schedule_id" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => args),
  eq: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
  lt: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(),
}));

import { DELETE, GET, POST, PUT } from "@/app/api/admin/schedules/route";
// The mocked stand-ins above, so a test can say which table a call named.
import { bookings, schedules, waitlistEntries } from "@/lib/db/schema";

describe("GET /api/admin/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReset();
    mockSelectFrom
      .mockReturnValueOnce({ innerJoin: mockInnerJoin }) // schedules query
      .mockReturnValueOnce({ groupBy: vi.fn().mockResolvedValue([]) }) // waitlist counts
      .mockReturnValue({
        // held-seat counts
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([]),
        }),
      });
    mockInnerJoin.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([]);
  });

  it("returns 200 with schedule list", async () => {
    const mockSchedules = [
      {
        schedules: {
          id: 1,
          classId: 1,
          date: "2026-05-01",
          startTime: "09:00",
          endTime: "10:00",
          capacity: 8,
          bookedCount: 3,
          location: "Studio 1",
          status: "open",
        },
        classes: {
          id: 1,
          slug: "prenatal",
          title: "Prenatal Yoga",
          category: "class",
          bookingType: "stripe",
          active: true,
          priceInPence: 1500,
        },
      },
    ];
    mockOrderBy.mockResolvedValue(mockSchedules);

    const response = await GET(
      new Request("http://localhost:3000/api/admin/schedules"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].schedules).toEqual(mockSchedules[0].schedules);
    expect(body[0].classes).toEqual(mockSchedules[0].classes);
    expect(body[0].waitlistCount).toBe(0);
  });

  it("returns 200 with empty list when no schedules", async () => {
    mockOrderBy.mockResolvedValue([]);

    const response = await GET(
      new Request("http://localhost:3000/api/admin/schedules"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
  });

  it("includes waitlistCount on each schedule row, defaulting to 0", async () => {
    const mockSchedules = [
      {
        schedules: {
          id: 1,
          classId: 1,
          date: "2026-05-01",
          startTime: "09:00",
          endTime: "10:00",
          capacity: 8,
          bookedCount: 8,
          location: "Studio 1",
          status: "full",
        },
        classes: {
          id: 1,
          slug: "prenatal",
          title: "Prenatal Yoga",
          category: "class",
          bookingType: "stripe",
          active: true,
          priceInPence: 1500,
        },
      },
      {
        schedules: {
          id: 2,
          classId: 1,
          date: "2026-05-08",
          startTime: "09:00",
          endTime: "10:00",
          capacity: 8,
          bookedCount: 3,
          location: "Studio 1",
          status: "open",
        },
        classes: {
          id: 1,
          slug: "prenatal",
          title: "Prenatal Yoga",
          category: "class",
          bookingType: "stripe",
          active: true,
          priceInPence: 1500,
        },
      },
    ];
    mockOrderBy.mockResolvedValue(mockSchedules);

    // The implementation does a second db.select() for waitlist counts:
    //   db.select({ scheduleId, count }).from(waitlistEntries).groupBy(...)
    // Reset mockSelectFrom so beforeEach's queued values don't interfere,
    // then set up exactly the two calls GET will make.
    const mockGroupBy = vi
      .fn()
      .mockResolvedValue([{ scheduleId: 1, count: 2 }]);
    mockSelectFrom.mockReset();
    mockSelectFrom
      .mockReturnValueOnce({ innerJoin: mockInnerJoin }) // schedules query
      .mockReturnValueOnce({ groupBy: mockGroupBy }) // waitlist count query
      .mockReturnValueOnce({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([]),
        }),
      }); // held-seat count query

    const response = await GET(
      new Request("http://localhost:3000/api/admin/schedules"),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(body[0].waitlistCount).toBe(2);
    expect(body[1].waitlistCount).toBe(0);
  });

  it("reports how many of the booked seats are being held", async () => {
    mockOrderBy.mockResolvedValue([
      {
        schedules: {
          id: 1,
          classId: 1,
          date: "2026-05-01",
          startTime: "09:00",
          endTime: "10:00",
          capacity: 8,
          bookedCount: 8,
          location: "Studio 1",
          status: "full",
        },
        classes: { id: 1, title: "Prenatal Yoga" },
      },
    ]);

    mockSelectFrom.mockReset();
    mockSelectFrom
      .mockReturnValueOnce({ innerJoin: mockInnerJoin })
      .mockReturnValueOnce({ groupBy: vi.fn().mockResolvedValue([]) })
      .mockReturnValueOnce({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([{ scheduleId: 1, count: 1 }]),
        }),
      });

    const response = await GET(
      new Request("http://localhost:3000/api/admin/schedules"),
    );
    const body = await response.json();
    // A full class with a held seat is not eight people coming.
    expect(body[0].heldCount).toBe(1);
  });
});

describe("POST /api/admin/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertValues.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([
      {
        id: 1,
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        capacity: 8,
        bookedCount: 0,
        location: null,
        status: "open",
      },
    ]);
  });

  it("returns 201 when creating a schedule", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body.classId).toBe(1);
  });

  it("returns 201 with custom capacity and location", async () => {
    mockReturning.mockResolvedValue([
      {
        id: 2,
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        capacity: 12,
        bookedCount: 0,
        location: "Studio 1, Hove",
        status: "open",
      },
    ]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        capacity: 12,
        location: "Studio 1, Hove",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.capacity).toBe(12);
    expect(body.location).toBe("Studio 1, Hove");
  });

  // The capacity box on /admin/schedule is not required, so clearing it sends
  // 0. That has always meant "use the default"; refusing it would fail the whole
  // create, and the form shows nothing when a request fails.
  it("treats a cleared capacity box as the default, not a refusal", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        capacity: 0,
        numberOfWeeks: 0,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ capacity: 8 }),
    );
  });

  it("returns 400 when required fields are missing", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 201 with array of 3 schedules when repeatWeekly is true", async () => {
    const recurringSchedules = [
      {
        id: 10,
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        capacity: 8,
        bookedCount: 0,
        location: null,
        recurringRule: "weekly:test-uuid",
        status: "open",
      },
      {
        id: 11,
        classId: 1,
        date: "2026-05-08",
        startTime: "09:00",
        endTime: "10:00",
        capacity: 8,
        bookedCount: 0,
        location: null,
        recurringRule: "weekly:test-uuid",
        status: "open",
      },
      {
        id: 12,
        classId: 1,
        date: "2026-05-15",
        startTime: "09:00",
        endTime: "10:00",
        capacity: 8,
        bookedCount: 0,
        location: null,
        recurringRule: "weekly:test-uuid",
        status: "open",
      },
    ];
    mockReturning.mockResolvedValue(recurringSchedules);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        repeatWeekly: true,
        numberOfWeeks: 3,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);

    // Verify dates are 7 days apart
    expect(body[0].date).toBe("2026-05-01");
    expect(body[1].date).toBe("2026-05-08");
    expect(body[2].date).toBe("2026-05-15");

    // Verify the insert was called with an array of 3 values
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ date: "2026-05-01" }),
        expect.objectContaining({ date: "2026-05-08" }),
        expect.objectContaining({ date: "2026-05-15" }),
      ]),
    );
  });

  it("returns single schedule when repeatWeekly is false", async () => {
    mockReturning.mockResolvedValue([
      {
        id: 1,
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        capacity: 8,
        bookedCount: 0,
        location: null,
        status: "open",
      },
    ]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        repeatWeekly: false,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    // Single object, not array
    expect(body.id).toBe(1);
    expect(Array.isArray(body)).toBe(false);
  });

  // The form's max="52" is an HTML attribute, so a direct call ignores it; the
  // schema is what stops 100000 rows going in.
  it("refuses more weeks than a year of them, naming the limit", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        repeatWeekly: true,
        numberOfWeeks: 100000,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Number of weeks cannot be more than 52");
    expect(mockInsertValues).not.toHaveBeenCalled();
  });

  it("accepts the full 52 weeks", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId: 1,
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
        repeatWeekly: true,
        numberOfWeeks: 52,
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockInsertValues.mock.calls[0]?.[0]).toHaveLength(52);
  });

  it("returns 400 when classId is missing", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-01",
        startTime: "09:00",
        endTime: "10:00",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });
});

describe("PUT /api/admin/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    // The GET suite resets this one to queue per-call results; the capacity
    // guard reads through it, so put the base chain back.
    mockSelectFrom.mockReturnValue({
      innerJoin: mockInnerJoin,
      where: mockSelectWhere,
    });
    mockSelectRows.mockReturnValue([]);
  });

  it("returns 200 when updating a schedule", async () => {
    mockUpdateReturning.mockResolvedValue([
      {
        id: 1,
        classId: 1,
        date: "2026-05-02",
        startTime: "10:00",
        endTime: "11:00",
        capacity: 10,
        bookedCount: 0,
        location: "Studio 2",
        status: "open",
      },
    ]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        date: "2026-05-02",
        startTime: "10:00",
        endTime: "11:00",
        capacity: 10,
        location: "Studio 2",
      }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body.date).toBe("2026-05-02");
    expect(body.capacity).toBe(10);
  });

  it("leaves capacity alone when the box was cleared, and still saves the rest", async () => {
    mockUpdateReturning.mockResolvedValue([
      { id: 1, classId: 1, date: "2026-05-02", capacity: 8 },
    ]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        date: "2026-05-02",
        startTime: "10:00",
        endTime: "11:00",
        capacity: 0,
      }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    const fields = mockUpdateSet.mock.calls[0]?.[0];
    expect(fields).not.toHaveProperty("capacity");
    expect(fields).toMatchObject({ date: "2026-05-02", startTime: "10:00" });
  });

  it("returns 400 when id is missing", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-05-02",
        startTime: "10:00",
        endTime: "11:00",
      }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing schedule ID");
  });

  it("refuses adding more weeks of recurrence than the limit", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 1,
        repeatWeekly: true,
        numberOfWeeks: 100000,
      }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Number of weeks cannot be more than 52");
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("returns 404 when schedule does not exist", async () => {
    mockUpdateReturning.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: 999,
        date: "2026-05-02",
      }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Schedule not found");
  });

  it("refuses a capacity below the seats already taken", async () => {
    // Occupancy may not exceed capacity, so the seats have to be given back
    // before the class shrinks. Answering with the number in the way beats a
    // constraint violation surfacing as a 500.
    mockSelectRows.mockReturnValue([{ bookedCount: 6 }]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, capacity: 5 }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("6 seats taken");
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("allows a capacity that still covers the seats already taken", async () => {
    mockSelectRows.mockReturnValue([{ bookedCount: 6 }]);
    mockUpdateReturning.mockResolvedValue([{ id: 1, capacity: 6 }]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, capacity: 6 }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
  });

  it("does not touch bookings or occupancy on an ordinary update", async () => {
    mockUpdateReturning.mockResolvedValue([{ id: 1, status: "open" }]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1, capacity: 10 }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

/**
 * Cancelling a class takes the offers outstanding on it with it: a held seat is
 * a promise of a place on a class that is not happening.
 */
describe("PUT /api/admin/schedules — cancelling", () => {
  const CANCELLED_SCHEDULE = {
    id: 1,
    classId: 1,
    date: "2026-05-02",
    startTime: "09:00",
    endTime: "10:00",
    capacity: 8,
    bookedCount: 8,
    location: "Studio 1",
    status: "cancelled",
  };

  function cancelRequest(id = 1, extra: Record<string, unknown> = {}) {
    return new Request("http://localhost:3000/api/admin/schedules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled", ...extra }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    queueTxUpdates();
  });

  it("cancels every held seat and gives those seats back", async () => {
    queueTxUpdates(
      [CANCELLED_SCHEDULE], // the schedule itself
      [{ id: 11 }, { id: 12 }], // the two held seats it cancelled
      [], // the occupancy release
    );

    const response = await PUT(cancelRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "cancelled" });

    // Schedule, then held bookings, then occupancy — all in one transaction.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxUpdate).toHaveBeenCalledTimes(3);
    expect(mockTxUpdateSet.mock.calls[0][0]).toEqual({ status: "cancelled" });
    expect(mockTxUpdateSet.mock.calls[1][0]).toEqual({ status: "cancelled" });
    expect(mockTxUpdateSet.mock.calls[2][0]).toHaveProperty("bookedCount");
  });

  it("frees no seats when the class had no offers outstanding", async () => {
    queueTxUpdates([CANCELLED_SCHEDULE], []);

    const response = await PUT(cancelRequest());

    expect(response.status).toBe(200);
    // The schedule and the guarded held-booking write, and nothing else: a class
    // with no offers on it is cancelled exactly as it was before.
    expect(mockTxUpdate).toHaveBeenCalledTimes(2);
    expect(
      mockTxUpdateSet.mock.calls.some(
        (call) =>
          (call[0] as Record<string, unknown>).bookedCount !== undefined,
      ),
    ).toBe(false);
  });

  it("is not blocked by outstanding offers", async () => {
    queueTxUpdates([CANCELLED_SCHEDULE], [{ id: 11 }], []);

    const response = await PUT(cancelRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 1 });
  });

  it("voids the offers even when the same request asks for recurrence", async () => {
    queueTxUpdates([CANCELLED_SCHEDULE], [{ id: 11 }], []);

    const response = await PUT(
      cancelRequest(1, { repeatWeekly: true, numberOfWeeks: 4 }),
    );

    // Cancelling is the unambiguous half of an incoherent request, so it wins
    // and the held seat cannot be left behind.
    expect(response.status).toBe(200);
    expect(mockTxUpdateSet.mock.calls[1][0]).toEqual({ status: "cancelled" });
    expect(mockTxUpdateSet.mock.calls[2][0]).toHaveProperty("bookedCount");
  });

  it("returns 404 without voiding anything when the schedule is gone", async () => {
    queueTxUpdates([]);

    const response = await PUT(cancelRequest(999));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Schedule not found");
    expect(mockTxUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/admin/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReset();
    mockSelectFrom.mockReturnValue({
      innerJoin: mockInnerJoin,
      where: mockSelectWhere,
    });
    mockSelectRows.mockReturnValue([]);
    mockDeleteFrom.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  function deleteRequest(id: number) {
    return new Request("http://localhost:3000/api/admin/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  /** The tables the handler deleted from, in the order it reached them. */
  function deletedTables() {
    return mockDeleteFrom.mock.calls.map(([table]) => table);
  }

  it("returns 200 and deletes the schedule when no bookings exist", async () => {
    mockSelectRows.mockReturnValue([]);

    const response = await DELETE(deleteRequest(1));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deleted).toBe(true);
    // Everything pointing at the schedule goes first: Postgres refuses the
    // parent delete while any of it is there. The waiting list before the
    // bookings, because an entry can still point at a held booking.
    expect(deletedTables()).toEqual([waitlistEntries, bookings, schedules]);
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("forgets the schedule on bookings that were moved off it", async () => {
    mockSelectRows.mockReturnValue([]);

    await DELETE(deleteRequest(1));

    expect(mockTxUpdateSet).toHaveBeenCalledWith({ originalScheduleId: null });
  });

  // Was "when any booking exists": a booking row that no longer holds a place
  // made the class undeletable forever, which is not what the refusal is for.
  it.each([
    "confirmed",
    "held",
    "waitlisted",
  ])("returns 409 and does not delete when a %s booking still holds a place", async (status) => {
    mockSelectRows.mockReturnValue([{ status }]);

    const response = await DELETE(deleteRequest(1));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/cancel the class instead/i);
    expect(mockDeleteFrom).not.toHaveBeenCalled();
  });

  it("deletes a class set up by mistake whose bookings were all given up", async () => {
    mockSelectRows.mockReturnValue([
      { status: "cancelled" },
      { status: "released" },
    ]);

    const response = await DELETE(deleteRequest(1));
    expect(response.status).toBe(200);
    // Those rows go with the class: they still reference it, and nobody is
    // coming. Asserted for real in tests/integration/schedule-delete.test.ts.
    expect(deletedTables()).toContain(bookings);
    expect(deletedTables()).toContain(schedules);
  });

  it("refuses when one booking is cancelled and another is not", async () => {
    mockSelectRows.mockReturnValue([
      { status: "cancelled" },
      { status: "confirmed" },
    ]);

    const response = await DELETE(deleteRequest(1));
    expect(response.status).toBe(409);
    expect(mockDeleteFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when id is missing", async () => {
    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing schedule ID");
  });
});

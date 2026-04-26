import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks
const {
  mockSelectFrom,
  mockInnerJoin,
  mockOrderBy,
  mockSelectWhere,
  mockSelectLimit,
  mockInsertValues,
  mockReturning,
  mockUpdateSet,
  mockUpdateWhere,
  mockUpdateReturning,
  mockDeleteFrom,
  mockDeleteWhere,
} = vi.hoisted(() => {
  const mockOrderBy = vi.fn().mockResolvedValue([]);
  const mockInnerJoin = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockSelectLimit = vi.fn().mockResolvedValue([]);
  const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
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
  return {
    mockSelectFrom,
    mockInnerJoin,
    mockOrderBy,
    mockSelectWhere,
    mockSelectLimit,
    mockInsertValues,
    mockReturning,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
    mockDeleteFrom,
    mockDeleteWhere,
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
  },
}));

vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id", active: "active" },
  schedules: { id: "id", classId: "class_id" },
  bookings: { id: "id", scheduleId: "schedule_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
}));

import { DELETE, GET, POST, PUT } from "@/app/api/admin/schedules/route";

describe("GET /api/admin/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({
      innerJoin: mockInnerJoin,
      where: mockSelectWhere,
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

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(mockSchedules);
  });

  it("returns 200 with empty list when no schedules", async () => {
    mockOrderBy.mockResolvedValue([]);

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual([]);
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
});

describe("DELETE /api/admin/schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({
      innerJoin: mockInnerJoin,
      where: mockSelectWhere,
    });
    mockSelectWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectLimit.mockResolvedValue([]);
    mockDeleteFrom.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockResolvedValue(undefined);
  });

  it("returns 200 and deletes the schedule when no bookings exist", async () => {
    mockSelectLimit.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1 }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deleted).toBe(true);
    expect(mockDeleteFrom).toHaveBeenCalledTimes(1);
  });

  it("returns 409 and does not delete when any booking exists", async () => {
    mockSelectLimit.mockResolvedValue([{ id: 42 }]);

    const request = new Request("http://localhost:3000/api/admin/schedules", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: 1 }),
    });

    const response = await DELETE(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/cancel the class instead/i);
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

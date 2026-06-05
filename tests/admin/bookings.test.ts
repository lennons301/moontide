import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockTransaction,
  mockTxUpdateSet,
  mockTxUpdateWhere,
  mockSendRescheduleNotification,
  mockAfter,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn();
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockTxUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere });
  const mockTransaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
    const tx = {
      update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
    };
    await cb(tx);
  });
  const mockSendRescheduleNotification = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockAfter = vi.fn((fn: () => Promise<void> | void) => fn());
  return {
    mockSelectFrom,
    mockSelectWhere,
    mockTransaction,
    mockTxUpdateSet,
    mockTxUpdateWhere,
    mockSendRescheduleNotification,
    mockAfter,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", scheduleId: "schedule_id", status: "status" },
  schedules: { id: "id", classId: "class_id", bookedCount: "booked_count" },
  classes: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((...args: unknown[]) => args),
  sql: Object.assign(
    vi.fn((..._args: unknown[]) => "sql"),
    {},
  ),
}));

vi.mock("@/lib/email", () => ({
  sendRescheduleNotification: mockSendRescheduleNotification,
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mockAfter };
});

import { PUT } from "@/app/api/admin/bookings/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/bookings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAMPLE_BOOKING = {
  id: 1,
  scheduleId: 10,
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  status: "confirmed",
  originalScheduleId: null,
};

const SAMPLE_SOURCE = {
  id: 10,
  classId: 100,
  date: "2026-06-09",
  startTime: "09:00",
  endTime: "10:00",
  capacity: 8,
  bookedCount: 3,
  location: "Studio 1",
  status: "open",
};

const SAMPLE_TARGET = {
  ...SAMPLE_SOURCE,
  id: 20,
  date: "2026-06-16",
  bookedCount: 2,
};

const SAMPLE_CLASS = { id: 100, title: "Prenatal Yoga" };

describe("PUT /api/admin/bookings — general validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  });

  it("returns 400 when id is missing", async () => {
    const response = await PUT(makeRequest({ status: "cancelled" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 400 when neither status nor newScheduleId is supplied", async () => {
    const response = await PUT(makeRequest({ id: 1 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });
});

describe("PUT /api/admin/bookings — cancel branch (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  });

  it("returns 404 when booking not found", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    const response = await PUT(makeRequest({ id: 999, status: "cancelled" }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Booking not found");
  });

  it("returns 400 when booking is already cancelled", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { ...SAMPLE_BOOKING, status: "cancelled" },
    ]);
    const response = await PUT(makeRequest({ id: 1, status: "cancelled" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Booking is already cancelled");
  });

  it("returns 200 and updates the booking on success", async () => {
    mockSelectWhere.mockResolvedValueOnce([SAMPLE_BOOKING]);
    const response = await PUT(makeRequest({ id: 1, status: "cancelled" }));
    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    expect(mockTxUpdateSet).toHaveBeenCalledWith({ status: "cancelled" });
  });
});

describe("PUT /api/admin/bookings — reschedule branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  });

  it("returns 404 when booking not found", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    const response = await PUT(makeRequest({ id: 999, newScheduleId: 20 }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Booking not found");
  });

  it("returns 400 when booking is cancelled", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { ...SAMPLE_BOOKING, status: "cancelled" },
    ]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Cannot reschedule a cancelled booking");
  });

  it("returns 404 when target schedule not found", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 999 }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Target schedule not found");
  });

  it("returns 400 when target class differs from source class", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([{ ...SAMPLE_TARGET, classId: 999 }]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Cannot reschedule to a different class");
  });

  it("returns 400 when target schedule is cancelled", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([{ ...SAMPLE_TARGET, status: "cancelled" }]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Target class is cancelled");
  });

  it("returns 400 when target equals source", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([SAMPLE_SOURCE]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 10 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Booking is already on that schedule");
  });

  it("returns 400 when target is at capacity", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([
        { ...SAMPLE_TARGET, bookedCount: 8, capacity: 8 },
      ]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Target class is full");
  });

  it("returns 200 on first reschedule, sets originalScheduleId, sends email", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([SAMPLE_TARGET])
      .mockResolvedValueOnce([SAMPLE_CLASS]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    const bookingUpdateCall = mockTxUpdateSet.mock.calls[0]?.[0];
    expect(bookingUpdateCall).toMatchObject({
      scheduleId: 20,
      originalScheduleId: 10,
    });
    expect(bookingUpdateCall.rescheduledAt).toBeInstanceOf(Date);
    expect(mockSendRescheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        classTitle: "Prenatal Yoga",
        oldDate: "2026-06-09",
        newDate: "2026-06-16",
      }),
    );
  });

  it("preserves originalScheduleId on second reschedule", async () => {
    const alreadyMoved = { ...SAMPLE_BOOKING, originalScheduleId: 5 };
    mockSelectWhere
      .mockResolvedValueOnce([alreadyMoved])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([SAMPLE_TARGET])
      .mockResolvedValueOnce([SAMPLE_CLASS]);
    await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    const bookingUpdateCall = mockTxUpdateSet.mock.calls[0]?.[0];
    expect(bookingUpdateCall.originalScheduleId).toBe(5);
  });
});

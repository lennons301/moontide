import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

const {
  mockSelectFrom,
  mockSelectWhere,
  mockTransaction,
  mockTxUpdateSet,
  mockTxUpdateReturning,
  mockSendRescheduleNotification,
  mockAfter,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn();
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  // Occupancy writes read the row back via .returning() (a guarded claim
  // returns no rows when it is refused); other updates just await the where().
  const mockTxUpdateReturning = vi.fn().mockResolvedValue([{ id: 20 }]);
  const mockTxUpdateWhere = vi.fn(() =>
    Object.assign(Promise.resolve(undefined), {
      returning: mockTxUpdateReturning,
    }),
  );
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
    mockTxUpdateReturning,
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
  bookings: {
    id: "id",
    scheduleId: "schedule_id",
    status: "status",
    bundleId: "bundle_id",
    createdAt: "created_at",
  },
  schedules: {
    id: "id",
    classId: "class_id",
    bookedCount: "booked_count",
    capacity: "capacity",
  },
  classes: { id: "id" },
  bundles: {
    id: "id",
    creditsRemaining: "credits_remaining",
    creditsTotal: "credits_total",
    status: "status",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((...args: unknown[]) => args),
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

import { GET, PUT } from "@/app/api/admin/bookings/route";
import {
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedOut,
} from "../support/admin-session";

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
    expect(mockTxUpdateSet).toHaveBeenCalledTimes(2);
  });

  it("does not touch any bundle when cancelling a non-bundle booking", async () => {
    mockSelectWhere.mockResolvedValueOnce([SAMPLE_BOOKING]);
    await PUT(makeRequest({ id: 1, status: "cancelled" }));
    const bundleUpdateCall = mockTxUpdateSet.mock.calls.find(
      (c) => c[0] && typeof c[0] === "object" && "creditsRemaining" in c[0],
    );
    expect(bundleUpdateCall).toBeUndefined();
  });

  it("restores a bundle credit when cancelling a bundle-funded booking", async () => {
    mockSelectWhere.mockResolvedValueOnce([{ ...SAMPLE_BOOKING, bundleId: 7 }]);
    const response = await PUT(makeRequest({ id: 1, status: "cancelled" }));
    expect(response.status).toBe(200);

    // booking + schedule + bundle updates
    expect(mockTxUpdateSet).toHaveBeenCalledTimes(3);

    // The bundle update restores credits and re-activates the bundle
    const bundleUpdateCall = mockTxUpdateSet.mock.calls.find(
      (c) => c[0] && typeof c[0] === "object" && "creditsRemaining" in c[0],
    );
    expect(bundleUpdateCall).toBeDefined();
    expect(bundleUpdateCall?.[0]).toHaveProperty("status");
  });
});

describe("PUT /api/admin/bookings — release branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  });

  it("returns 404 when booking not found", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    const response = await PUT(makeRequest({ id: 999, status: "released" }));
    expect(response.status).toBe(404);
  });

  it("returns 400 when the booking is already released", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { ...SAMPLE_BOOKING, status: "released" },
    ]);
    const response = await PUT(makeRequest({ id: 1, status: "released" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Booking has already been released");
  });

  it("moves a card booking to released and frees the seat", async () => {
    mockSelectWhere.mockResolvedValueOnce([SAMPLE_BOOKING]);
    const response = await PUT(makeRequest({ id: 1, status: "released" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.effect).toBe("class-owed");

    // booking + schedule only: nothing is refunded and no bundle is touched
    expect(mockTxUpdateSet).toHaveBeenCalledTimes(2);
    const bookingUpdate = mockTxUpdateSet.mock.calls[0]?.[0];
    expect(bookingUpdate.status).toBe("released");
    expect(bookingUpdate.releasedAt).toBeInstanceOf(Date);
  });

  it("cancels a bundle booking and hands the credit back", async () => {
    mockSelectWhere.mockResolvedValueOnce([{ ...SAMPLE_BOOKING, bundleId: 7 }]);
    const response = await PUT(makeRequest({ id: 1, status: "released" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.effect).toBe("bundle-credit-returned");

    expect(mockTxUpdateSet.mock.calls[0]?.[0].status).toBe("cancelled");
    const bundleUpdateCall = mockTxUpdateSet.mock.calls.find(
      (c) => c[0] && typeof c[0] === "object" && "creditsRemaining" in c[0],
    );
    expect(bundleUpdateCall).toBeDefined();
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
    expect(mockTxUpdateSet).toHaveBeenCalledTimes(3);
  });

  it("increments the target only when moving a released booking, and confirms it", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ ...SAMPLE_BOOKING, status: "released" }])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([SAMPLE_TARGET])
      .mockResolvedValueOnce([SAMPLE_CLASS]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(200);

    // booking + target only — the source seat was returned at release
    expect(mockTxUpdateSet).toHaveBeenCalledTimes(2);
    const bookingUpdate = mockTxUpdateSet.mock.calls[0]?.[0];
    expect(bookingUpdate.status).toBe("confirmed");
    expect(bookingUpdate.releasedAt).toBeNull();
  });

  it("returns 400 when the atomic claim loses a race for the last place", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([SAMPLE_TARGET])
      .mockResolvedValueOnce([SAMPLE_CLASS]);
    // The guarded claim matches no row: the target filled up after the check.
    mockTxUpdateReturning.mockResolvedValueOnce([]);

    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Target class is full");
    expect(mockSendRescheduleNotification).not.toHaveBeenCalled();
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

describe("GET /api/admin/bookings", () => {
  const ROW = {
    bookings: SAMPLE_BOOKING,
    schedules: SAMPLE_SOURCE,
    classes: SAMPLE_CLASS,
  };

  // The list joins twice and orders, where every other read here ends at
  // .where(); give this describe its own tail on the chain.
  let mockOrderBy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    mockOrderBy = vi.fn().mockResolvedValue([ROW]);
    const innerJoin: ReturnType<typeof vi.fn> = vi.fn(() => ({
      innerJoin,
      orderBy: mockOrderBy,
    }));
    mockSelectFrom.mockReturnValue({ innerJoin });
  });

  function listRequest() {
    return new Request("http://localhost:3000/api/admin/bookings");
  }

  it("returns every booking with its schedule and class, newest first", async () => {
    const response = await GET(listRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([ROW]);
    expect(mockOrderBy).toHaveBeenCalledWith("created_at");
  });

  it("returns an empty list when there are no bookings", async () => {
    mockOrderBy.mockResolvedValue([]);

    const response = await GET(listRequest());
    expect(await response.json()).toEqual([]);
  });

  it("refuses an unauthenticated caller without reading the table", async () => {
    signedOut();

    const response = await GET(listRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockSelectFrom).not.toHaveBeenCalled();
  });

  it("refuses a signed-in caller who is not the admin", async () => {
    signedInAsNonAdmin();

    const response = await GET(listRequest());

    expect(response.status).toBe(403);
    expect(mockSelectFrom).not.toHaveBeenCalled();
  });
});

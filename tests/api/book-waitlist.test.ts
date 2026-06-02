import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelectFrom,
  mockInnerJoin,
  mockSelectWhere,
  mockInsertValues,
  mockInsertReturning,
  mockUpdateSet,
  mockUpdateWhere,
  mockSendWaitlistConfirmation,
  mockSendWaitlistNotification,
  mockAfter,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn().mockResolvedValue([]);
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelectFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockInsertReturning });
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockSendWaitlistConfirmation = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockSendWaitlistNotification = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockAfter = vi.fn((fn: () => Promise<void> | void) => fn());
  return {
    mockSelectFrom,
    mockInnerJoin,
    mockSelectWhere,
    mockInsertValues,
    mockInsertReturning,
    mockUpdateSet,
    mockUpdateWhere,
    mockSendWaitlistConfirmation,
    mockSendWaitlistNotification,
    mockAfter,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id" },
  schedules: { id: "id", classId: "class_id" },
  waitlistEntries: {
    id: "id",
    scheduleId: "schedule_id",
    customerEmail: "customer_email",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendWaitlistConfirmation: mockSendWaitlistConfirmation,
  sendWaitlistNotification: mockSendWaitlistNotification,
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mockAfter,
  };
});

import { POST } from "@/app/api/book/waitlist/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/book/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SCHEDULE_ROW = {
  schedules: {
    id: 1,
    status: "full",
    bookedCount: 8,
    capacity: 8,
    date: "2026-05-01",
    startTime: "09:00",
    endTime: "10:00",
    location: null,
  },
  classes: { id: 1, title: "Prenatal Yoga" },
};

describe("POST /api/book/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ innerJoin: mockInnerJoin });
    mockInnerJoin.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockResolvedValue([SCHEDULE_ROW]);
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning });
    mockInsertReturning.mockResolvedValue([{ id: 1 }]);
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue(undefined);
    mockSendWaitlistConfirmation.mockResolvedValue({ success: true });
    mockSendWaitlistNotification.mockResolvedValue({ success: true });
  });

  it("returns 400 when fields are missing", async () => {
    const response = await POST(
      makeRequest({ scheduleId: 1, customerName: "Jane" }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 404 when schedule not found", async () => {
    mockSelectWhere.mockResolvedValue([]);
    const response = await POST(
      makeRequest({
        scheduleId: 999,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Schedule not found");
  });

  it("returns 400 when schedule is cancelled", async () => {
    mockSelectWhere.mockResolvedValue([
      {
        ...SCHEDULE_ROW,
        schedules: { ...SCHEDULE_ROW.schedules, status: "cancelled" },
      },
    ]);
    const response = await POST(
      makeRequest({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class is not available");
  });

  it("returns 400 when schedule still has spots", async () => {
    mockSelectWhere.mockResolvedValue([
      {
        ...SCHEDULE_ROW,
        schedules: {
          ...SCHEDULE_ROW.schedules,
          status: "open",
          bookedCount: 3,
          capacity: 8,
        },
      },
    ]);
    const response = await POST(
      makeRequest({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class still has spots — please book normally");
  });

  it("inserts and fires emails when schedule status is 'full'", async () => {
    // 1st db.select() → schedule lookup (via .from().innerJoin().where()).
    // 2nd db.select() → count query (via .from().where()).
    mockSelectFrom
      .mockReturnValueOnce({ innerJoin: mockInnerJoin })
      .mockReturnValueOnce({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      });

    const response = await POST(
      makeRequest({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    );
    expect(mockSendWaitlistConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        classTitle: "Prenatal Yoga",
      }),
    );
    expect(mockSendWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Jane Doe",
        classTitle: "Prenatal Yoga",
        waitlistCount: 1,
      }),
    );
    expect(mockUpdateSet).toHaveBeenCalledWith({ emailSent: true });
  });

  it("inserts when status='open' but bookedCount >= capacity", async () => {
    mockSelectWhere.mockResolvedValue([
      {
        ...SCHEDULE_ROW,
        schedules: {
          ...SCHEDULE_ROW.schedules,
          status: "open",
          bookedCount: 8,
          capacity: 8,
        },
      },
    ]);
    mockSelectFrom
      .mockReturnValueOnce({ innerJoin: mockInnerJoin })
      .mockReturnValueOnce({
        where: vi.fn().mockResolvedValue([{ count: 1 }]),
      });

    const response = await POST(
      makeRequest({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    );
    expect(response.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalled();
  });

  it("treats duplicate (scheduleId, email) as success without throwing", async () => {
    const duplicateError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    mockInsertReturning.mockRejectedValue(duplicateError);

    const response = await POST(
      makeRequest({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(mockSendWaitlistConfirmation).not.toHaveBeenCalled();
    expect(mockSendWaitlistNotification).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("normalises email to lowercase and trims whitespace before insert", async () => {
    mockSelectFrom
      .mockReturnValueOnce({ innerJoin: mockInnerJoin })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      });

    const response = await POST(
      makeRequest({
        scheduleId: 1,
        customerName: "  Jane Doe  ",
        customerEmail: "  Jane@Example.COM  ",
      }),
    );
    expect(response.status).toBe(200);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    );
  });
});

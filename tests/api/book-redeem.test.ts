import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks
const {
  mockSelect,
  mockSelectFrom,
  mockSelectWhere,
  mockInnerJoin,
  mockInsertValues,
  mockInsert,
  mockUpdateWhere,
  mockUpdateReturning,
  mockUpdateSet,
  mockUpdate,
  mockTransaction,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn().mockResolvedValue([]);
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelectFrom = vi.fn().mockReturnValue({
    where: mockSelectWhere,
    innerJoin: mockInnerJoin,
  });
  const mockInsertValues = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  // The occupancy claim reads the row back via .returning() — a non-empty array
  // means the guarded UPDATE matched and the seat was taken. The bundle update
  // just awaits the where(), so the chain is both awaitable and chainable.
  const mockUpdateReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockUpdateWhere = vi.fn(() =>
    Object.assign(Promise.resolve([]), { returning: mockUpdateReturning }),
  );
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
  const mockTransaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: mockInsert,
        update: mockUpdate,
        select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
      };
      return await fn(tx);
    },
  );
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
  return {
    mockSelect,
    mockSelectFrom,
    mockSelectWhere,
    mockInnerJoin,
    mockInsertValues,
    mockInsert,
    mockUpdateWhere,
    mockUpdateReturning,
    mockUpdateSet,
    mockUpdate,
    mockTransaction,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bundles: {
    id: "id",
    customerEmail: "customer_email",
    status: "status",
    creditsRemaining: "credits_remaining",
    expiresAt: "expires_at",
  },
  bookings: {
    id: "id",
    scheduleId: "schedule_id",
    customerEmail: "customer_email",
    status: "status",
  },
  schedules: {
    id: "id",
    classId: "class_id",
    bookedCount: "booked_count",
    capacity: "capacity",
    status: "status",
  },
  classes: { id: "id", bundleEligible: "bundle_eligible" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gt: vi.fn((...args: unknown[]) => args),
  lt: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}));

import { POST } from "@/app/api/book/redeem/route";

describe("POST /api/book/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockInnerJoin.mockReturnValue({ where: mockSelectWhere });
    mockSelectFrom.mockReturnValue({
      where: mockSelectWhere,
      innerJoin: mockInnerJoin,
    });
    mockSelectWhere.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockResolvedValue([{ id: 1 }]);
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockImplementation(() =>
      Object.assign(Promise.resolve([]), { returning: mockUpdateReturning }),
    );
    mockUpdateReturning.mockResolvedValue([{ id: 1 }]);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          insert: mockInsert,
          update: mockUpdate,
          select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
        };
        return await fn(tx);
      },
    );
  });

  it("returns 400 when required fields are missing", async () => {
    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: 1 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 404 when the schedule does not exist", async () => {
    mockSelectWhere.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 999,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Schedule not found");

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("refuses to spend a credit on a class that is not bundle-eligible", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { bundleEligible: false, status: "open" },
    ]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("This class cannot be booked with a bundle");

    // No credit spent, no booking created
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns 404 when no active bundle found", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("No active bundle found");
  });

  it("returns 200 for valid bundle redemption", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([
        {
          id: 10,
          customerEmail: "jane@example.com",
          creditsTotal: 6,
          creditsRemaining: 4,
          status: "active",
          expiresAt: new Date("2026-12-31"),
        },
      ])
      .mockResolvedValueOnce([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.creditsRemaining).toBe(3);

    // Verify transaction was used for atomicity
    expect(mockTransaction).toHaveBeenCalledOnce();

    // Verify booking was inserted
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        bundleId: 10,
      }),
    );

    // Verify bundle credits were decremented
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsRemaining: 3,
        status: "active",
      }),
    );

    // Verify the seat was taken through the guarded claim
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ bookedCount: expect.anything() }),
    );
    expect(mockUpdateReturning).toHaveBeenCalled();
  });

  it("returns 409 when customer already has a booking for this schedule", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([
        {
          id: 10,
          customerEmail: "jane@example.com",
          creditsTotal: 6,
          creditsRemaining: 4,
          status: "active",
          expiresAt: new Date("2026-12-31"),
        },
      ])
      .mockResolvedValueOnce([{ id: 99, status: "confirmed" }]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("You already have a booking for this class");

    // No booking should be created and no credit spent
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("refuses to spend a credit on a cancelled class", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { bundleEligible: true, status: "cancelled" },
    ]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class is not available");

    // Nothing written: no booking, no credit spent, no occupancy change.
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses to spend a credit when the class has no places left", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([
        {
          id: 10,
          customerEmail: "jane@example.com",
          creditsTotal: 6,
          creditsRemaining: 4,
          status: "active",
          expiresAt: new Date("2026-12-31"),
        },
      ])
      .mockResolvedValueOnce([]);
    // The guarded claim matches no row when occupancy is already at capacity.
    mockUpdateReturning.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class is full");

    // The refusal came from the claim's own UPDATE, so it is safe under a race.
    expect(mockUpdateReturning).toHaveBeenCalled();

    // No booking created and no credit spent — the only write attempted was the
    // guarded claim, which matched nothing.
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ creditsRemaining: expect.anything() }),
    );
  });

  it("does not read occupancy ahead of the claim", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([
        {
          id: 10,
          customerEmail: "jane@example.com",
          creditsTotal: 6,
          creditsRemaining: 4,
          status: "active",
          expiresAt: new Date("2026-12-31"),
        },
      ])
      .mockResolvedValueOnce([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    await POST(request);

    // Capacity must never be decided from a value read before the claim: the
    // schedule lookup pulls status and bundle eligibility, nothing occupancy.
    expect(mockSelect).toHaveBeenCalledWith({
      status: "status",
      bundleEligible: "bundle_eligible",
    });
    expect(mockSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({ bookedCount: expect.anything() }),
    );
    expect(mockSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({ capacity: expect.anything() }),
    );
  });

  it("sets bundle status to exhausted when credits reach 0", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([{ bundleEligible: true, status: "open" }])
      .mockResolvedValueOnce([
        {
          id: 10,
          customerEmail: "jane@example.com",
          creditsTotal: 6,
          creditsRemaining: 1,
          status: "active",
          expiresAt: new Date("2026-12-31"),
        },
      ])
      .mockResolvedValueOnce([]);

    const request = new Request("http://localhost:3000/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.creditsRemaining).toBe(0);

    // Verify bundle status set to exhausted
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        creditsRemaining: 0,
        status: "exhausted",
      }),
    );
  });
});

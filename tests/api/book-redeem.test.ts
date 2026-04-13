import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks
const {
  mockSelectFrom,
  mockSelectWhere,
  mockInsertValues,
  mockInsert,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockTransaction,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn().mockResolvedValue([]);
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockInsertValues = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  const mockUpdateWhere = vi.fn().mockResolvedValue([]);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
  const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      insert: mockInsert,
      update: mockUpdate,
      select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    };
    await fn(tx);
  });
  return {
    mockSelectFrom,
    mockSelectWhere,
    mockInsertValues,
    mockInsert,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockTransaction,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
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
  bookings: { id: "id", scheduleId: "schedule_id" },
  schedules: { id: "id", bookedCount: "booked_count" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gt: vi.fn((...args: unknown[]) => args),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}));

import { POST } from "@/app/api/book/redeem/route";

describe("POST /api/book/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockResolvedValue([]);
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockResolvedValue([{ id: 1 }]);
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue([]);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          insert: mockInsert,
          update: mockUpdate,
          select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
        };
        await fn(tx);
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

  it("returns 404 when no active bundle found", async () => {
    mockSelectWhere.mockResolvedValue([]);

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
    mockSelectWhere.mockResolvedValue([
      {
        id: 10,
        customerEmail: "jane@example.com",
        creditsTotal: 6,
        creditsRemaining: 4,
        status: "active",
        expiresAt: new Date("2026-12-31"),
      },
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
  });

  it("sets bundle status to exhausted when credits reach 0", async () => {
    mockSelectWhere.mockResolvedValue([
      {
        id: 10,
        customerEmail: "jane@example.com",
        creditsTotal: 6,
        creditsRemaining: 1,
        status: "active",
        expiresAt: new Date("2026-12-31"),
      },
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

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

const { mockSelectFrom, mockWhere, mockTxUpdateSet, mockTransaction } =
  vi.hoisted(() => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockSelectFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockTxUpdateWhere = vi.fn().mockResolvedValue([]);
    const mockTxUpdateSet = vi
      .fn()
      .mockReturnValue({ where: mockTxUpdateWhere });
    const mockTransaction = vi.fn(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
        };
        await fn(tx);
      },
    );
    return {
      mockSelectFrom,
      mockWhere,
      mockTxUpdateSet,
      mockTransaction,
    };
  });

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bundleConfig: { id: "id", active: "active" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

import { GET, PUT } from "@/app/api/admin/pricing/route";

describe("GET /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it("returns bundle configs", async () => {
    const mockBundleConfigs = [
      {
        id: 1,
        name: "6-Class Bundle",
        priceInPence: 6600,
        credits: 6,
        expiryDays: 90,
        active: true,
      },
    ];

    mockSelectFrom.mockReturnValue({
      where: vi.fn().mockResolvedValue(mockBundleConfigs),
    });

    const response = await GET(
      new Request("http://localhost:3000/api/admin/pricing"),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.bundleConfigs).toEqual(mockBundleConfigs);
    expect(body.classes).toBeUndefined();
  });
});

describe("PUT /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxUpdateSet.mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    });
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = {
          update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
        };
        await fn(tx);
      },
    );
  });

  it("returns 400 when body is empty", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("No updates provided");
  });

  it("returns 400 for zero bundle credits", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleConfigs: [{ id: 1, credits: 0 }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bundle credits must be greater than 0");
  });

  it("returns 400 for zero bundle expiry days", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleConfigs: [{ id: 1, expiryDays: 0 }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bundle expiry days must be greater than 0");
  });

  it("updates bundle config via transaction", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundleConfigs: [{ id: 1, priceInPence: 7200, credits: 8 }],
      }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});

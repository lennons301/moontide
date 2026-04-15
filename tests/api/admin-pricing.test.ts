import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelectFrom,
  mockWhere,
  mockUpdateSet,
  mockUpdateWhere,
  mockTransaction,
} = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue([]);
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdateWhere = vi.fn().mockResolvedValue([]);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    const mockTxUpdateWhere = vi.fn().mockResolvedValue([]);
    const mockTxUpdateSet = vi
      .fn()
      .mockReturnValue({ where: mockTxUpdateWhere });
    const tx = {
      update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
    };
    await fn(tx);
  });
  return {
    mockSelectFrom,
    mockWhere,
    mockUpdateSet,
    mockUpdateWhere,
    mockTransaction,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id", priceInPence: "price_in_pence" },
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

  it("returns classes and bundle configs", async () => {
    const mockClasses = [
      { id: 1, title: "Prenatal Yoga", slug: "prenatal", priceInPence: 1250 },
    ];
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

    // First call returns classes (no where clause), second returns bundle configs (with where)
    mockSelectFrom
      .mockReturnValueOnce({ where: vi.fn().mockResolvedValue(mockClasses) })
      .mockReturnValueOnce({
        where: vi.fn().mockResolvedValue(mockBundleConfigs),
      });

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.classes).toEqual(mockClasses);
    expect(body.bundleConfigs).toEqual(mockBundleConfigs);
  });
});

describe("PUT /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue([]);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const mockTxUpdateWhere = vi.fn().mockResolvedValue([]);
        const mockTxUpdateSet = vi
          .fn()
          .mockReturnValue({ where: mockTxUpdateWhere });
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

  it("returns 400 for negative class price", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classes: [{ id: 1, priceInPence: -100 }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class prices must be greater than 0");
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

  it("updates class prices via transaction", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classes: [{ id: 1, priceInPence: 1400 }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();
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

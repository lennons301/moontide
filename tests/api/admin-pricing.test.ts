import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

const {
  mockSelectFrom,
  mockSelectDistinctFrom,
  mockSelectDistinctWhere,
  mockInsertValues,
  mockInsertReturning,
  mockTxSelectLimit,
  mockTxDeleteWhere,
  mockTxDeleteReturning,
  mockTxUpdateSet,
  mockTransaction,
} = vi.hoisted(() => {
  const mockSelectFrom = vi.fn().mockResolvedValue([]);

  const mockSelectDistinctWhere = vi.fn().mockResolvedValue([]);
  const mockSelectDistinctFrom = vi
    .fn()
    .mockReturnValue({ where: mockSelectDistinctWhere });

  const mockInsertReturning = vi.fn();
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockInsertReturning });

  const mockTxUpdateWhere = vi.fn().mockResolvedValue([]);
  const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere });

  const mockTxSelectLimit = vi.fn().mockResolvedValue([]);
  const mockTxSelectWhere = vi
    .fn()
    .mockReturnValue({ limit: mockTxSelectLimit });
  const mockTxSelectFrom = vi
    .fn()
    .mockReturnValue({ where: mockTxSelectWhere });

  const mockTxDeleteReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockTxDeleteWhere = vi
    .fn()
    .mockReturnValue({ returning: mockTxDeleteReturning });

  const mockTx = {
    select: vi.fn().mockReturnValue({ from: mockTxSelectFrom }),
    update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
    delete: vi.fn().mockReturnValue({ where: mockTxDeleteWhere }),
  };

  const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    await fn(mockTx);
  });

  return {
    mockSelectFrom,
    mockSelectDistinctFrom,
    mockSelectDistinctWhere,
    mockInsertValues,
    mockInsertReturning,
    mockTxSelectFrom,
    mockTxSelectWhere,
    mockTxSelectLimit,
    mockTxDeleteWhere,
    mockTxDeleteReturning,
    mockTxUpdateSet,
    mockTransaction,
    mockTx,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    selectDistinct: vi.fn().mockReturnValue({ from: mockSelectDistinctFrom }),
    insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bundleConfig: { id: "id", active: "active" },
  bundles: { id: "id", bundleConfigId: "bundle_config_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  isNotNull: vi.fn((...args: unknown[]) => args),
}));

import { DELETE, GET, POST, PUT } from "@/app/api/admin/pricing/route";

const SIX_CLASS_BUNDLE = {
  id: 1,
  name: "6-Class Bundle",
  priceInPence: 6600,
  credits: 6,
  expiryDays: 90,
  active: true,
};

function deleteRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/pricing", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/pricing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockResolvedValue([]);
    mockSelectDistinctWhere.mockResolvedValue([]);
  });

  it("returns every bundle config, active or not, marked with whether it has been purchased", async () => {
    mockSelectFrom.mockResolvedValue([
      SIX_CLASS_BUNDLE,
      { ...SIX_CLASS_BUNDLE, id: 2, name: "4-Class Bundle", active: false },
    ]);
    mockSelectDistinctWhere.mockResolvedValue([{ bundleConfigId: 1 }]);

    const response = await GET(
      new Request("http://localhost:3000/api/admin/pricing"),
    );
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.bundleConfigs).toEqual([
      { ...SIX_CLASS_BUNDLE, purchased: true },
      {
        ...SIX_CLASS_BUNDLE,
        id: 2,
        name: "4-Class Bundle",
        active: false,
        purchased: false,
      },
    ]);
  });
});

describe("POST /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsertReturning.mockResolvedValue([
      { ...SIX_CLASS_BUNDLE, id: 2, name: "4-Class Bundle", credits: 4 },
    ]);
  });

  it("creates a bundle config", async () => {
    const response = await POST(
      postRequest({
        name: "4-Class Bundle",
        priceInPence: 4400,
        credits: 4,
        expiryDays: 90,
      }),
    );

    expect(response.status).toBe(201);
    expect(mockInsertValues).toHaveBeenCalledWith({
      name: "4-Class Bundle",
      priceInPence: 4400,
      credits: 4,
      expiryDays: 90,
    });
  });

  it("requires a name", async () => {
    const response = await POST(
      postRequest({ priceInPence: 4400, credits: 4, expiryDays: 90 }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Bundle name is required");
  });

  it("requires a positive price, credits and expiry", async () => {
    const response = await POST(
      postRequest({ name: "X", priceInPence: 0, credits: 4, expiryDays: 90 }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Bundle price must be greater than 0",
    );
  });

  it("answers a duplicate name with a friendly refusal, not a fault", async () => {
    mockInsertReturning.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );

    const response = await POST(
      postRequest({
        name: "6-Class Bundle",
        priceInPence: 6600,
        credits: 6,
        expiryDays: 90,
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "A bundle with this name already exists",
    );
  });
});

describe("PUT /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("toggles active as part of the same update", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleConfigs: [{ id: 1, active: false }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect(mockTxUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    );
  });
});

describe("DELETE /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSelectLimit.mockResolvedValue([]);
    mockTxDeleteReturning.mockResolvedValue([{ id: 1 }]);
  });

  it("deletes a bundle config that has never been purchased", async () => {
    const response = await DELETE(deleteRequest({ id: 1 }));

    expect(response.status).toBe(200);
    expect(mockTxDeleteWhere).toHaveBeenCalled();
  });

  it("refuses to delete a bundle config that has been purchased", async () => {
    mockTxSelectLimit.mockResolvedValue([{ id: 42 }]);

    const response = await DELETE(deleteRequest({ id: 1 }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "This bundle has been purchased and can't be deleted. Deactivate it instead.",
    );
    expect(mockTxDeleteWhere).not.toHaveBeenCalled();
  });

  it("answers 404 when the bundle config does not exist", async () => {
    mockTxDeleteReturning.mockResolvedValue([]);

    const response = await DELETE(deleteRequest({ id: 999 }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Bundle not found");
  });

  it("requires an id", async () => {
    const response = await DELETE(deleteRequest({}));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Missing bundle ID");
  });
});

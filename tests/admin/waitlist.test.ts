import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockSelectOrderBy,
  mockDeleteFrom,
  mockDeleteWhere,
  mockDeleteReturning,
} = vi.hoisted(() => {
  const mockSelectOrderBy = vi.fn().mockResolvedValue([]);
  const mockSelectWhere = vi
    .fn()
    .mockReturnValue({ orderBy: mockSelectOrderBy });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockDeleteReturning = vi.fn().mockResolvedValue([]);
  const mockDeleteWhere = vi
    .fn()
    .mockReturnValue({ returning: mockDeleteReturning });
  const mockDeleteFrom = vi.fn().mockReturnValue({ where: mockDeleteWhere });
  return {
    mockSelectFrom,
    mockSelectWhere,
    mockSelectOrderBy,
    mockDeleteFrom,
    mockDeleteWhere,
    mockDeleteReturning,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    delete: mockDeleteFrom,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  waitlistEntries: {
    id: "id",
    scheduleId: "schedule_id",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: unknown) => col),
}));

import { DELETE, GET } from "@/app/api/admin/waitlist/route";

describe("GET /api/admin/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
    mockSelectWhere.mockReturnValue({ orderBy: mockSelectOrderBy });
    mockSelectOrderBy.mockResolvedValue([]);
  });

  it("returns 400 when scheduleId is missing", async () => {
    const request = new Request("http://localhost:3000/api/admin/waitlist");
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing scheduleId");
  });

  it("returns 400 when scheduleId is not numeric", async () => {
    const request = new Request(
      "http://localhost:3000/api/admin/waitlist?scheduleId=abc",
    );
    const response = await GET(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing scheduleId");
  });

  it("returns entries for the given scheduleId", async () => {
    const entries = [
      {
        id: 1,
        scheduleId: 42,
        customerName: "Jane",
        customerEmail: "jane@example.com",
        createdAt: "2026-06-01T10:00:00Z",
      },
      {
        id: 2,
        scheduleId: 42,
        customerName: "John",
        customerEmail: "john@example.com",
        createdAt: "2026-06-02T11:00:00Z",
      },
    ];
    mockSelectOrderBy.mockResolvedValue(entries);

    const request = new Request(
      "http://localhost:3000/api/admin/waitlist?scheduleId=42",
    );
    const response = await GET(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(entries);
  });
});

describe("DELETE /api/admin/waitlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteFrom.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockReturnValue({ returning: mockDeleteReturning });
    mockDeleteReturning.mockResolvedValue([{ id: 1 }]);
  });

  it("returns 400 when id is missing", async () => {
    const request = new Request("http://localhost:3000/api/admin/waitlist", {
      method: "DELETE",
    });
    const response = await DELETE(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing id");
  });

  it("returns 200 when an entry is removed", async () => {
    const request = new Request(
      "http://localhost:3000/api/admin/waitlist?id=1",
      { method: "DELETE" },
    );
    const response = await DELETE(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.deleted).toBe(true);
  });

  it("returns 404 when the entry does not exist", async () => {
    mockDeleteReturning.mockResolvedValue([]);
    const request = new Request(
      "http://localhost:3000/api/admin/waitlist?id=999",
      { method: "DELETE" },
    );
    const response = await DELETE(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Waitlist entry not found");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

const { mockOrderBy, mockFrom } = vi.hoisted(() => {
  const mockOrderBy = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
  return { mockOrderBy, mockFrom };
});

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn().mockReturnValue({ from: mockFrom }) },
}));

vi.mock("@/lib/db/schema", () => ({
  bundles: { id: "id", purchasedAt: "purchased_at" },
}));

vi.mock("drizzle-orm", () => ({ desc: vi.fn((col: unknown) => col) }));

import { GET } from "@/app/api/admin/bundles/route";
import {
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedOut,
} from "../support/admin-session";

const BUNDLE = {
  id: 1,
  customerEmail: "jane@example.com",
  creditsTotal: 6,
  creditsRemaining: 4,
  status: "active",
};

function request() {
  return new Request("http://localhost:3000/api/admin/bundles");
}

describe("GET /api/admin/bundles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    mockFrom.mockReturnValue({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValue([BUNDLE]);
  });

  it("returns every bundle, newest purchase first", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([BUNDLE]);
    expect(mockOrderBy).toHaveBeenCalledWith("purchased_at");
  });

  it("returns an empty list when there are no bundles", async () => {
    mockOrderBy.mockResolvedValue([]);

    const response = await GET(request());
    expect(await response.json()).toEqual([]);
  });

  it("refuses an unauthenticated caller without reading the table", async () => {
    signedOut();

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a signed-in customer who is not the admin", async () => {
    signedInAsNonAdmin();

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

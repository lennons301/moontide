import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

const { mockWhere, mockFrom, mockEq } = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockEq = vi.fn((...args: unknown[]) => args);
  return { mockWhere, mockFrom, mockEq };
});

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn().mockReturnValue({ from: mockFrom }) },
}));

vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id", active: "active" },
}));

vi.mock("drizzle-orm", () => ({ eq: mockEq }));

import { GET } from "@/app/api/admin/classes/route";
import {
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedOut,
} from "../support/admin-session";

const PRENATAL = { id: 1, slug: "prenatal-yoga", title: "Prenatal Yoga" };

function request() {
  return new Request("http://localhost:3000/api/admin/classes");
}

describe("GET /api/admin/classes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([PRENATAL]);
  });

  it("returns the active classes only", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([PRENATAL]);
    expect(mockEq).toHaveBeenCalledWith("active", true);
  });

  it("refuses an unauthenticated caller without reading the table", async () => {
    signedOut();

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a signed-in customer who is not the admin", async () => {
    signedInAsNonAdmin();

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

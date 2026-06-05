import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateSet, mockUpdateWhere, mockUpdateReturning } = vi.hoisted(
  () => {
    const mockUpdateReturning = vi.fn();
    const mockUpdateWhere = vi
      .fn()
      .mockReturnValue({ returning: mockUpdateReturning });
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    return { mockUpdateSet, mockUpdateWhere, mockUpdateReturning };
  },
);

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  contactSubmissions: { id: "id", read: "read" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
}));

import { PUT } from "@/app/api/admin/messages/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/messages", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateReturning.mockResolvedValue([
      { id: 1, name: "Jane", email: "j@x.com", read: true },
    ]);
  });

  it("returns 400 when id is missing", async () => {
    const response = await PUT(makeRequest({ read: true }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing id");
  });

  it("returns 400 when id is not numeric", async () => {
    const response = await PUT(makeRequest({ id: "abc", read: true }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing id");
  });

  it("returns 404 when message not found", async () => {
    mockUpdateReturning.mockResolvedValue([]);
    const response = await PUT(makeRequest({ id: 999, read: true }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Message not found");
  });

  it("returns 200 with the updated row on success", async () => {
    const response = await PUT(makeRequest({ id: 1, read: true }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body.read).toBe(true);
    expect(mockUpdateSet).toHaveBeenCalledWith({ read: true });
  });
});

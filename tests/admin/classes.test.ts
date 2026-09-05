import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

const mockRevalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

const mockGetServicePagePaths = vi.fn();
vi.mock("@/lib/content/services", () => ({
  getServicePagePaths: () => mockGetServicePagePaths(),
}));
mockGetServicePagePaths.mockResolvedValue([
  "/",
  "/classes/prenatal-yoga",
  "/coaching",
  "/community",
  "/private",
]);

const {
  mockWhere,
  mockFrom,
  mockEq,
  mockInsertValues,
  mockInsertReturning,
  mockUpdateSet,
  mockUpdateReturning,
  mockRecordSlugRename,
  mockDb,
} = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockEq = vi.fn((...args: unknown[]) => args);
  const mockInsertReturning = vi.fn();
  const mockInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockInsertReturning });
  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi
    .fn()
    .mockReturnValue({ returning: mockUpdateReturning });
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockRecordSlugRename = vi.fn().mockResolvedValue({ ok: true });
  const mockDb = {
    select: vi.fn().mockReturnValue({ from: mockFrom }),
    insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
    transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(mockDb)),
  };
  return {
    mockWhere,
    mockFrom,
    mockEq,
    mockInsertValues,
    mockInsertReturning,
    mockUpdateSet,
    mockUpdateReturning,
    mockRecordSlugRename,
    mockDb,
  };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));

vi.mock("@/lib/db/schema", () => ({
  classes: {
    id: "id",
    active: "active",
    title: "title",
    slug: "slug",
    category: "category",
    bookingType: "booking_type",
    priceInPence: "price_in_pence",
    bundleEligible: "bundle_eligible",
  },
}));

// The slug-rename write (the redirect history, the collision it refuses) is
// SQL that has to execute against a real unique constraint, so it is
// integration-tested (`tests/integration/class-slug-redirects.test.ts`)
// rather than simulated here. This suite only checks the route's wiring to it.
vi.mock("@/lib/classes/slug-redirects", () => ({
  recordSlugRename: (...args: unknown[]) => mockRecordSlugRename(...args),
}));

vi.mock("drizzle-orm", () => ({ eq: mockEq }));

import { GET, POST, PUT } from "@/app/api/admin/classes/route";
import {
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedOut,
} from "../support/admin-session";

const PRENATAL = {
  id: 1,
  slug: "prenatal-yoga",
  title: "Prenatal Yoga",
  category: "class",
  bookingType: "stripe",
  priceInPence: 1250,
  active: true,
  bundleEligible: true,
};

function getRequest(query = "") {
  return new Request(`http://localhost:3000/api/admin/classes${query}`);
}

function postRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/classes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/classes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/admin/classes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([PRENATAL]);
  });

  it("returns the active classes only by default", async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([PRENATAL]);
    expect(mockEq).toHaveBeenCalledWith("active", true);
  });

  it("returns every class, active or not, when asked for all", async () => {
    const response = await GET(getRequest("?all=true"));

    expect(response.status).toBe(200);
    expect(mockEq).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller without reading the table", async () => {
    signedOut();

    const response = await GET(getRequest());

    expect(response.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("refuses a signed-in customer who is not the admin", async () => {
    signedInAsNonAdmin();

    const response = await GET(getRequest());

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/classes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    mockInsertReturning.mockResolvedValue([PRENATAL]);
  });

  it("creates a class and revalidates the public service pages", async () => {
    const response = await POST(
      postRequest({
        title: "Prenatal Yoga",
        slug: "prenatal-yoga",
        category: "class",
        priceInPence: 1250,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(PRENATAL);
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Prenatal Yoga",
        slug: "prenatal-yoga",
        category: "class",
        priceInPence: 1250,
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/coaching");
    // The path list comes from the catalogue, not a hardcoded list, so a
    // sixth class or a rename picks up the same revalidation a create
    // through Sanity does.
    expect(mockGetServicePagePaths).toHaveBeenCalled();
  });

  it("requires a title", async () => {
    const response = await POST(
      postRequest({ slug: "x", category: "class", priceInPence: 100 }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Title is required");
  });

  it("requires a slug", async () => {
    const response = await POST(
      postRequest({ title: "X", category: "class", priceInPence: 100 }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Slug is required");
  });

  it("refuses a slug with uppercase letters or spaces", async () => {
    const response = await POST(
      postRequest({
        title: "X",
        slug: "Not A Slug",
        category: "class",
        priceInPence: 100,
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Slug must be lowercase letters, numbers and hyphens only",
    );
  });

  it("refuses a category it does not know", async () => {
    const response = await POST(
      postRequest({
        title: "X",
        slug: "x",
        category: "retreat",
        priceInPence: 100,
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Category must be one of: class, coaching, community",
    );
  });

  it("refuses a price that is not positive", async () => {
    const response = await POST(
      postRequest({
        title: "X",
        slug: "x",
        category: "class",
        priceInPence: 0,
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Price must be greater than 0");
  });

  it("answers a duplicate slug with a friendly refusal, not a fault", async () => {
    mockInsertReturning.mockRejectedValue(
      Object.assign(new Error("duplicate key"), { code: "23505" }),
    );

    const response = await POST(
      postRequest({
        title: "X",
        slug: "prenatal-yoga",
        category: "class",
        priceInPence: 100,
      }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "A class with this slug already exists",
    );
  });
});

describe("PUT /api/admin/classes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    mockUpdateReturning.mockResolvedValue([{ ...PRENATAL, active: false }]);
  });

  it("deactivates a class", async () => {
    const response = await PUT(putRequest({ id: 1, active: false }));

    expect(response.status).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalledWith({ active: false });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockGetServicePagePaths).toHaveBeenCalled();
  });

  it("reactivates a class", async () => {
    await PUT(putRequest({ id: 1, active: true }));
    expect(mockUpdateSet).toHaveBeenCalledWith({ active: true });
  });

  it("updates title, category, booking type, price and bundle eligibility", async () => {
    await PUT(
      putRequest({
        id: 1,
        title: "New Title",
        category: "coaching",
        bookingType: "contact",
        priceInPence: 2000,
        bundleEligible: false,
      }),
    );

    expect(mockUpdateSet).toHaveBeenCalledWith({
      title: "New Title",
      category: "coaching",
      bookingType: "contact",
      priceInPence: 2000,
      bundleEligible: false,
    });
  });

  it("renames a slug, recording the redirect it leaves behind", async () => {
    mockWhere.mockResolvedValueOnce([{ slug: "old-slug" }]);

    const response = await PUT(
      putRequest({ id: 1, title: "New Title", slug: "new-slug" }),
    );

    expect(response.status).toBe(200);
    // The route hands the write its slug as it stood before this request —
    // the recording module has no way to know that on its own.
    expect(mockRecordSlugRename).toHaveBeenCalledWith(mockDb, {
      classId: 1,
      oldSlug: "old-slug",
      newSlug: "new-slug",
    });
    expect(mockUpdateSet).toHaveBeenCalledWith({
      title: "New Title",
      slug: "new-slug",
    });
  });

  it("refuses a rename the redirect history refuses, without touching the class", async () => {
    mockWhere.mockResolvedValueOnce([{ slug: "old-slug" }]);
    mockRecordSlugRename.mockResolvedValueOnce({
      ok: false,
      error: "This slug was previously used by another class",
      httpStatus: 409,
    });

    const response = await PUT(putRequest({ id: 1, slug: "taken-slug" }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "This slug was previously used by another class",
    );
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("refuses an update that names no field to change", async () => {
    const response = await PUT(putRequest({ id: 1 }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Class updates must include a title, slug, category, booking type, price, active state or bundle eligibility",
    );
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("answers 404 when the class does not exist", async () => {
    mockUpdateReturning.mockResolvedValue([]);

    const response = await PUT(putRequest({ id: 999, active: false }));

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Class not found");
  });
});

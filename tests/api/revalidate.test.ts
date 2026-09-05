import { beforeEach, describe, expect, it, vi } from "vitest";
import { givenClassCatalogueHolds } from "../support/classes";

const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

vi.mock(
  "@/lib/db",
  async () => (await import("../support/classes")).dbModuleMock,
);

vi.mock(
  "@/lib/sanity/client",
  async () => (await import("../support/sanity-client")).sanityModuleMock,
);

// Set env before importing route
vi.stubEnv("SANITY_WEBHOOK_SECRET", "test-secret");

import { POST } from "@/app/api/revalidate/route";

const CATALOGUE = [
  { slug: "prenatal", title: "Prenatal Yoga", category: "class" as const },
  { slug: "postnatal", title: "Postnatal Yoga", category: "class" as const },
  {
    slug: "baby-yoga",
    title: "Baby Yoga & Massage",
    category: "class" as const,
  },
  {
    slug: "vinyasa",
    title: "Autumn Equinox Yin",
    category: "class" as const,
  },
];

function makeRequest(body: object, secret?: string) {
  return new Request("http://localhost:3000/api/revalidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-sanity-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    givenClassCatalogueHolds(CATALOGUE);
  });

  it("returns 401 if secret is missing", async () => {
    const res = await POST(makeRequest({ _type: "service" }));
    expect(res.status).toBe(401);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns 401 if secret is wrong", async () => {
    const res = await POST(makeRequest({ _type: "service" }, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates service paths when a service is published", async () => {
    const res = await POST(makeRequest({ _type: "service" }, "test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toContain("/");
    expect(json.revalidated).toContain("/classes/prenatal");
    expect(json.revalidated).toContain("/classes/postnatal");
    expect(json.revalidated).toContain("/classes/baby-yoga");
    expect(json.revalidated).toContain("/classes/vinyasa");
    expect(json.revalidated).toContain("/coaching");
    expect(json.revalidated).toContain("/community");
    expect(json.revalidated).toContain("/private");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(8);
  });

  it("revalidates whatever the catalogue holds, not a fixed list", async () => {
    givenClassCatalogueHolds([
      { slug: "evening-flow", title: "Evening Flow", category: "class" },
    ]);

    const res = await POST(makeRequest({ _type: "service" }, "test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toEqual([
      "/",
      "/classes/evening-flow",
      "/coaching",
      "/community",
      "/private",
    ]);
    expect(mockRevalidatePath).toHaveBeenCalledTimes(5);
  });

  it("revalidates trainer paths when a trainer is published", async () => {
    const res = await POST(makeRequest({ _type: "trainer" }, "test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toContain("/");
    expect(json.revalidated).toContain("/about");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
  });

  it("revalidates community path when a communityEvent is published", async () => {
    const res = await POST(
      makeRequest({ _type: "communityEvent" }, "test-secret"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toContain("/community");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
  });

  it("revalidates homepage when siteSettings are published", async () => {
    const res = await POST(
      makeRequest({ _type: "siteSettings" }, "test-secret"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toContain("/");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for unknown document type", async () => {
    const res = await POST(makeRequest({ _type: "unknown" }, "test-secret"));
    expect(res.status).toBe(400);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/revalidate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sanity-webhook-secret": "test-secret",
      },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

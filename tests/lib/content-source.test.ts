import { afterEach, describe, expect, it, vi } from "vitest";
import { inMemoryContentSource } from "@/lib/content/in-memory-source";
import {
  type ContentSource,
  fetchOrNull,
  resetContentSource,
  setContentSource,
} from "@/lib/content/source";
import * as queries from "@/lib/sanity/queries";

vi.mock(
  "@/lib/sanity/client",
  async () => (await import("../support/sanity-client")).sanityModuleMock,
);

afterEach(resetContentSource);

describe("fetchOrNull", () => {
  it("hands back what the source answered", async () => {
    setContentSource({ fetch: async () => ({ title: "Moontide" }) });

    expect(await fetchOrNull(queries.siteSettingsQuery)).toEqual({
      title: "Moontide",
    });
  });

  it("degrades a failing read to nothing, so the caller falls back", async () => {
    setContentSource({
      fetch: () => Promise.reject(new Error("ENOTFOUND api.sanity.io")),
    });

    expect(await fetchOrNull(queries.trainerQuery)).toBeNull();
  });

  it("degrades an undefined answer to nothing", async () => {
    setContentSource({ fetch: async () => undefined });

    expect(await fetchOrNull(queries.trainerQuery)).toBeNull();
  });

  it("passes params through to the source", async () => {
    const seen: { query: string; params?: Record<string, string> }[] = [];
    const recording: ContentSource = {
      fetch: async (query, params) => {
        seen.push({ query, params });
        return null;
      },
    };
    setContentSource(recording);

    await fetchOrNull(queries.serviceBySlugQuery, { slug: "coaching" });

    expect(seen).toEqual([
      { query: queries.serviceBySlugQuery, params: { slug: "coaching" } },
    ]);
  });
});

describe("the in-memory source", () => {
  it("answers every query the module can ask", async () => {
    const source = inMemoryContentSource();

    // A query it has not been taught throws, which `fetchOrNull` would turn
    // into permanent fallback content. So each one is checked here instead.
    for (const [name, query] of Object.entries(queries)) {
      await expect(
        source.fetch(query, { slug: "coaching" }),
        `${name} is unanswered by the in-memory source`,
      ).resolves.not.toThrow();
    }
  });

  it("throws for a query it does not know", async () => {
    await expect(
      inMemoryContentSource().fetch('*[_type == "invented"]'),
    ).rejects.toThrow(/unknown query/);
  });

  it("picks a service out of the documents it was given by slug", async () => {
    const source = inMemoryContentSource({
      services: [
        {
          _id: "s1",
          title: "Coaching",
          slug: { current: "coaching" },
          category: "coaching",
          bookingType: "contact",
        },
      ],
    });

    await expect(
      source.fetch(queries.serviceBySlugQuery, { slug: "coaching" }),
    ).resolves.toMatchObject({ title: "Coaching" });
    await expect(
      source.fetch(queries.serviceBySlugQuery, { slug: "private" }),
    ).resolves.toBeNull();
  });

  it("fails the read it was handed an error for", async () => {
    const source = inMemoryContentSource({
      trainer: new Error("query failed"),
      siteSettings: { title: "Moontide", contactEmail: "hello@example.com" },
    });

    await expect(source.fetch(queries.trainerQuery)).rejects.toThrow(
      "query failed",
    );
    await expect(source.fetch(queries.siteSettingsQuery)).resolves.toEqual({
      title: "Moontide",
      contactEmail: "hello@example.com",
    });
  });
});

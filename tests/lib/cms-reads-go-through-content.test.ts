import { describe, expect, it } from "vitest";

/**
 * The CMS is read in one place.
 *
 * `src/lib/content/` owns the GROQ queries, the client that runs them and the
 * fallback for every answer. A page that fetches for itself has to know which
 * query, which params and what to fall back to — which is how six pages ended
 * up with six copies of the idiom and two disagreeing stories about Gabrielle.
 *
 * The files are discovered rather than listed, so a new page is held to this
 * the moment it exists.
 */
const SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** The module that is allowed to know: the content module itself. */
const CONTENT_MODULE = "/src/lib/content/";

function filesOutsideContentModuleContaining(needle: string): string[] {
  return Object.entries(SOURCES)
    .filter(([path]) => !path.startsWith(CONTENT_MODULE))
    .filter(([, source]) => source.includes(needle))
    .map(([path]) => path)
    .sort();
}

describe("reading the CMS", () => {
  it("is the content module's alone to do", () => {
    expect(filesOutsideContentModuleContaining("sanityClient.fetch")).toEqual(
      [],
    );
  });

  it("is the content module's alone to name a query for", () => {
    expect(filesOutsideContentModuleContaining("@/lib/sanity/queries")).toEqual(
      [],
    );
  });

  it("sweeps the files it means to", () => {
    // A glob that matched nothing would pass every assertion above.
    expect(Object.keys(SOURCES)).toContain("/src/app/about/page.tsx");
    expect(Object.keys(SOURCES)).toContain("/src/lib/content/services.ts");
  });
});

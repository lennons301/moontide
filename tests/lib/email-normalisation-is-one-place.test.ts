import { describe, expect, it } from "vitest";

/**
 * Normalising a customer's email address is one module's job.
 *
 * It used to be five independent decisions — four of them being not to bother
 * — and the one handler that did normalise made things worse rather than
 * better: it stored `ada@` for someone who typed `Ada@`, so the duplicate
 * checks reading raw addresses stopped matching their own waiting-list place.
 *
 * The files are discovered rather than listed, so a new handler is held to this
 * the moment it exists.
 */
const SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** The module that is allowed to know how an address is folded. */
const EMAIL_MODULE = "/src/lib/customers/email.ts";

/**
 * An expression that folds the case of something called an email — with or
 * without a trim on the way. A search box folding a needle it is about to
 * match on is not this, which is why the sweep is for addresses rather than for
 * `toLowerCase` anywhere.
 */
const FOLDS_AN_EMAIL = /mail[^;\n]*\.toLowerCase\(\)/i;

function filesMatching(pattern: RegExp): string[] {
  return Object.entries(SOURCES)
    .filter(([path]) => path !== EMAIL_MODULE)
    .filter(([, source]) => pattern.test(source as string))
    .map(([path]) => path)
    .sort();
}

describe("folding an email address", () => {
  it("is nobody else's to do", () => {
    expect(filesMatching(FOLDS_AN_EMAIL)).toEqual([]);
  });

  it("sweeps the files it means to", () => {
    // A glob that matched nothing would pass every assertion above.
    expect(Object.keys(SOURCES)).toContain(
      "/src/app/api/book/checkout/route.ts",
    );
    expect(Object.keys(SOURCES)).toContain(
      "/src/app/api/book/waitlist/route.ts",
    );
    expect(Object.keys(SOURCES)).toContain("/src/lib/waitlist/offers.ts");
  });
});

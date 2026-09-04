import { describe, expect, it } from "vitest";

/**
 * Everything about sending an email is one module's job.
 *
 * Before `src/lib/notifications/`, eleven senders each wrote out the `from`
 * address, four of them resolved "who is the admin" themselves, eight repeated
 * the same `en-GB` options block, and nine call sites hand-rolled their own
 * `after` + `try/catch` + flag write — in four different error postures. Each
 * assertion below is one of those counts, held at one.
 *
 * The files are discovered rather than listed, so a new sender or a new call
 * site is held to this the moment it exists.
 */
const SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
});

function filesMatching(pattern: RegExp, within = /^\/src\//): string[] {
  return Object.entries(SOURCES)
    .filter(([path]) => within.test(path))
    .filter(([, source]) => pattern.test(source as string))
    .map(([path]) => path)
    .sort();
}

describe("the Moontide from address", () => {
  it("is written down once", () => {
    expect(filesMatching(/noreply@gabriellemoontide\.co\.uk/)).toEqual([
      "/src/lib/notifications/adapter.ts",
    ]);
  });
});

describe("Gabrielle's address", () => {
  it("is resolved once, not once per sender", () => {
    expect(filesMatching(/CONTACT_EMAIL/)).toEqual([
      "/src/lib/notifications/policy.ts",
    ]);
  });
});

describe("the transport", () => {
  it("is named only by the adapter that hides it", () => {
    expect(filesMatching(/from "resend"|resend\.emails\.send/)).toEqual([
      "/src/lib/notifications/adapter.ts",
    ]);
  });
});

describe("how a date is written", () => {
  /**
   * Server-side only. The admin tables have their own four date shapes in
   * `src/components/admin/format-date.ts`, and the public pages format dates
   * for the screen; neither is an email, and neither is what this is about.
   */
  const SERVER = /^\/src\/(lib|app\/api)\//;

  it("is decided in the notification formatter, and in the timezone helper", () => {
    expect(filesMatching(/"en-GB"/, SERVER)).toEqual([
      "/src/lib/notifications/format.ts",
      // Not a display format at all: `Intl` is how a London wall clock is read
      // out of a UTC instant.
      "/src/lib/time/london.ts",
    ]);
  });
});

describe("scheduling a send", () => {
  it("is `notifyAfterResponse`'s, so no handler wires up its own `after`", () => {
    // `after` used to appear in six handlers, each wrapping its own try/catch
    // and its own flag write, which is how four different error postures grew.
    expect(filesMatching(/\bafter\(/, /^\/src\/(lib|app\/api)\//)).toEqual([
      "/src/lib/notifications/index.ts",
    ]);
  });
});

describe("the sweep", () => {
  it("looks at the files it means to", () => {
    // A glob that matched nothing would pass every assertion above.
    const paths = Object.keys(SOURCES);
    expect(paths).toContain("/src/app/api/stripe/webhook/route.ts");
    expect(paths).toContain("/src/app/api/contact/route.ts");
    expect(paths).toContain("/src/app/api/admin/waitlist/offer/route.ts");
    expect(paths).toContain("/src/lib/waitlist/daily.ts");
    expect(paths).toContain("/src/lib/notifications/templates.ts");
  });
});

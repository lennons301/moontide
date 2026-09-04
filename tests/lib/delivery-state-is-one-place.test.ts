import { describe, expect, it } from "vitest";

/**
 * Marking a notification delivered is one module's job.
 *
 * `emailSent: true` used to be written in five handlers, each keeping its own
 * idea of what delivery meant: none of them counted an attempt, dated one or
 * recorded why one failed, and the two paths that read the flag had drifted
 * apart. `markEmailSent` / `markEmailFailed` are both sides of one write, so a
 * sixth path cannot invent a sixth version of it.
 *
 * The files are discovered rather than listed, so a new handler is held to this
 * the moment it exists.
 */
const SOURCES = import.meta.glob("/src/**/*.{ts,tsx}", {
  eager: true,
  query: "?raw",
  import: "default",
});

/** The module that owns the delivery-state columns. */
const DELIVERY_MODULE = "/src/lib/notifications/delivery.ts";

/** Setting the flag by hand, in a `.set({ ... })` or anywhere else. */
const WRITES_THE_FLAG = /emailSent:\s*(true|false)/;

function filesMatching(pattern: RegExp): string[] {
  return Object.entries(SOURCES)
    .filter(([path]) => path !== DELIVERY_MODULE)
    .filter(([, source]) => pattern.test(source as string))
    .map(([path]) => path)
    .sort();
}

describe("writing the email-sent flag", () => {
  it("is nobody else's to do — except the reschedule, which owes a new one", () => {
    // A reschedule sets the flag back to false in the same statement that moves
    // the booking, because the row it is writing does not exist yet as far as
    // the customer is concerned. That is a transition into owing an email, not
    // a claim that one was delivered.
    expect(filesMatching(WRITES_THE_FLAG)).toEqual([
      "/src/app/api/admin/bookings/route.ts",
    ]);
  });

  it("sweeps the files it means to", () => {
    // A glob that matched nothing would pass every assertion above.
    expect(Object.keys(SOURCES)).toContain(
      "/src/app/api/stripe/webhook/route.ts",
    );
    expect(Object.keys(SOURCES)).toContain(
      "/src/app/api/book/waitlist/route.ts",
    );
    expect(Object.keys(SOURCES)).toContain(
      "/src/app/api/admin/resend-email/route.ts",
    );
    expect(Object.keys(SOURCES)).toContain("/src/lib/notifications/retry.ts");
  });
});

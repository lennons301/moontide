import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bookings, bundles, waitlistEntries } from "@/lib/db/schema";
import { markEmailFailed, markEmailSent } from "@/lib/notifications/delivery";
import {
  createBooking,
  createBundle,
  createWaitlistEntry,
} from "./support/factories";

/**
 * The delivery-state writes against a real Postgres. The attempt count is
 * incremented in SQL from the row being written, not from one read beforehand,
 * so the only way to see it actually counting is to run it — and the columns
 * themselves only exist if migration 0018 applied.
 */

async function booking(id: number) {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
  return row;
}

describe("markEmailSent", () => {
  it("marks the row sent, dates it, counts the attempt and clears the error", async () => {
    const row = await createBooking({
      emailSent: false,
      emailLastError: "Resend is down",
    });
    const sentAt = new Date("2026-06-01T08:00:00.000Z");

    await markEmailSent(bookings, row.id, sentAt);

    const stored = await booking(row.id);
    expect(stored).toMatchObject({
      emailSent: true,
      emailAttempts: 1,
      emailLastError: null,
    });
    expect(stored.emailSentAt?.toISOString()).toBe(sentAt.toISOString());
  });

  it("takes a condition rather than an id, for the paths that only know one", async () => {
    // The Stripe webhook knows the session it just processed, not the id of the
    // row it wrote.
    const row = await createBooking({ stripePaymentId: "cs_test_delivery" });

    await markEmailSent(
      bookings,
      eq(bookings.stripePaymentId, "cs_test_delivery"),
    );

    expect(await booking(row.id)).toMatchObject({ emailSent: true });
  });
});

describe("markEmailFailed", () => {
  it("counts the attempt and records why, leaving the row unsent", async () => {
    const row = await createBooking({ emailSent: false });

    await markEmailFailed(bookings, row.id, new Error("Resend is down"));
    await markEmailFailed(bookings, row.id, new Error("Still down"));

    // Two attempts counted from the row itself, so a second failure cannot roll
    // the first one back — and the flag is untouched, which is what puts the row
    // in tomorrow's sweep.
    expect(await booking(row.id)).toMatchObject({
      emailSent: false,
      emailAttempts: 2,
      emailLastError: "Still down",
      emailSentAt: null,
    });
  });

  it("records against a bundle and a waiting-list place too", async () => {
    const purchase = await createBundle({ emailSent: false });
    const place = await createWaitlistEntry({ emailSent: false });

    await markEmailFailed(bundles, purchase.id, new Error("Resend is down"));
    await markEmailFailed(waitlistEntries, place.id, "Resend is down");

    const [storedBundle] = await db
      .select()
      .from(bundles)
      .where(eq(bundles.id, purchase.id));
    const [storedPlace] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, place.id));

    expect(storedBundle).toMatchObject({
      emailAttempts: 1,
      emailLastError: "Resend is down",
    });
    expect(storedPlace).toMatchObject({
      emailAttempts: 1,
      emailLastError: "Resend is down",
    });
  });
});

describe("a booking's pending notification", () => {
  it("starts as the confirmation it is created owing", async () => {
    const row = await createBooking();
    expect(row.emailKind).toBe("confirmation");
    expect(row.emailAttempts).toBe(0);
    expect(row.emailSentAt).toBeNull();
  });
});

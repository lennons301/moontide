import type { SQL } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, bundles, waitlistEntries } from "@/lib/db/schema";

/**
 * Sole owner of the delivery-state columns — `emailSent`, `emailAttempts`,
 * `emailSentAt` and `emailLastError`. No route sets `emailSent` itself.
 *
 * There used to be one flag, written `true` in five places and read in one, and
 * the two paths that read it had drifted apart. Both outcomes of an attempt are
 * recorded here so they cannot drift again: a success and a failure are the same
 * write with a different result, and the attempt count goes up either way.
 *
 * The count is incremented in SQL rather than computed from a row read first, so
 * a manual resend running while the sweep is mid-flight cannot roll the other
 * one's attempt back.
 */

/** The three tables that owe somebody an email. */
export type DeliveryTable =
  | typeof bookings
  | typeof bundles
  | typeof waitlistEntries;

export const deliveryTables = { bookings, bundles, waitlistEntries };

/**
 * Which row owes the email: its id, or a condition for the paths that do not
 * have one yet — the Stripe webhook knows the session it just processed, not
 * the id of the row it wrote.
 */
export type DeliveryTarget = number | SQL;

function rowMatching(table: DeliveryTable, target: DeliveryTarget) {
  return typeof target === "number" ? eq(table.id, target) : target;
}

/**
 * What we can say to a human about a send that threw. Kept short: it is stored
 * on the row and shown in the admin, not a place to put a stack trace.
 */
export function describeDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const trimmed = message.trim();
  if (trimmed.length === 0) return "Unknown error";
  return trimmed.length > 500 ? `${trimmed.slice(0, 497)}...` : trimmed;
}

/** The email went out: nothing is owed, and the last failure no longer stands. */
export async function markEmailSent(
  table: DeliveryTable,
  target: DeliveryTarget,
  sentAt: Date = new Date(),
): Promise<void> {
  await db
    .update(table)
    .set({
      emailSent: true,
      emailSentAt: sentAt,
      emailAttempts: sql`${table.emailAttempts} + 1`,
      emailLastError: null,
    })
    .where(rowMatching(table, target));
}

/**
 * The email did not go out. `emailSent` is deliberately left alone — false rows
 * stay false so the next sweep picks them up again, and there is no attempt
 * ceiling: abandoning a row quietly is the defect this replaces.
 *
 * Never throws. Every caller is already handling a failed send, and the row is
 * picked up again whether or not the explanation was written down — so a
 * database that is also unwell must not turn one lost email into a lost handler.
 */
export async function markEmailFailed(
  table: DeliveryTable,
  target: DeliveryTarget,
  error: unknown,
): Promise<void> {
  try {
    await db
      .update(table)
      .set({
        emailAttempts: sql`${table.emailAttempts} + 1`,
        emailLastError: describeDeliveryError(error),
      })
      .where(rowMatching(table, target));
  } catch (recordError) {
    console.error("Failed to record a delivery failure:", recordError);
  }
}

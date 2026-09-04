import { and, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  describeBundleProduct,
  selectBundlesWithConfig,
} from "@/lib/bundles/with-config";
import { db } from "@/lib/db";
import {
  bookings,
  bundles,
  classes,
  schedules,
  waitlistEntries,
} from "@/lib/db/schema";
import { notify } from "@/lib/notifications";
import {
  bookingNotificationFor,
  recognisedKind,
} from "@/lib/notifications/booking-emails";
import type { DeliveryTable } from "@/lib/notifications/delivery";
import type { NotificationEvent } from "@/lib/notifications/events";
import { londonDateString } from "@/lib/time/london";

/**
 * The retry sweep: every notification with a recipient that has not gone out.
 *
 * **Unbounded, not time-bounded.** It used to take only rows from the last 24
 * hours while the cron ran once a day, so a row created just over 24 hours
 * before the run fell out of the window and was never retried and never
 * reported. There is no attempt ceiling either, for the same reason: a row that
 * keeps failing keeps being tried and keeps carrying its last error, rather than
 * being quietly given up on. The work is idempotent — the flag is the queue, and
 * a row leaves it only when its email has actually gone out.
 *
 * The one thing that takes a row out of the sweep without sending is
 * **irrelevance to the recipient**: a confirmation for a class that has already
 * happened, or for a bundle that has already expired, tells them nothing they
 * can use and reads as a mistake. Those rows are counted, logged by id, and left
 * with their flag false — so they still show as unsent in the admin, with the
 * resend button beside them, which is where a human decides what to do about
 * one. Nothing is dropped without being counted somewhere.
 */

export type RetryOutcome = {
  sent: number;
  failed: number;
  /** Rows deliberately left: past class, expired bundle, missing product. */
  skipped: number;
};

export type RetrySweep = {
  bookingConfirmations: RetryOutcome;
  reschedules: RetryOutcome;
  /** Rows owing a notification whose kind this does not recognise. */
  unrecognised: RetryOutcome;
  bundleConfirmations: RetryOutcome;
  waitlistConfirmations: RetryOutcome;
};

const nothing = (): RetryOutcome => ({ sent: 0, failed: 0, skipped: 0 });

/**
 * One attempt, counted. Both outcomes are recorded on the row by `notify`, and
 * a failure never stops the sweep: the row keeps its flag and its error, and
 * the next run tries it again.
 */
async function attempt(
  outcome: RetryOutcome,
  table: DeliveryTable,
  id: number,
  description: string,
  event: NotificationEvent,
): Promise<void> {
  const result = await notify(event, { on: table, row: id });
  if (result.ok) {
    outcome.sent++;
  } else {
    // `notify` has already logged the reason; this names the row it was for.
    console.error(`Failed to retry ${description}`);
    outcome.failed++;
  }
}

/** Counted and named, so a row left behind is never left silently. */
function skip(
  outcome: RetryOutcome,
  description: string,
  reason: string,
): void {
  outcome.skipped++;
  console.warn(`Not retrying ${description}: ${reason}`);
}

/** A class that has been and gone: an email about it helps nobody. */
function hasHappened(date: string, today: string): boolean {
  return date < today;
}

/**
 * Which bookings still owe their customer a notification.
 *
 * Three statuses are excluded, all for the same reason — the email would say
 * something that is no longer true of the row. A **held** seat is an offer
 * nobody has taken up, so confirming it would tell them their class is booked
 * when it is not. A **cancelled** or **released** booking no longer holds a
 * place, so neither "you are booked" nor "your booking has moved" is a thing to
 * send about it: the sweep being unbounded is exactly what would otherwise turn
 * an old cancelled row into a confirmation months later.
 *
 * Both kinds come back in one read rather than one query each, so a row whose
 * `emailKind` is neither of them is a row this has in its hand and can report,
 * instead of one that quietly matches no query at all.
 */
function stillOwedANotification() {
  return and(
    eq(bookings.emailSent, false),
    ne(bookings.status, "held"),
    ne(bookings.status, "cancelled"),
    ne(bookings.status, "released"),
  );
}

/**
 * Every booking notification nobody has received: confirmations, and the
 * moved-date notes a reschedule failed to send.
 *
 * Which email a given row owes is `sendBookingEmail`'s decision, shared with the
 * admin's resend button so the two paths cannot send different things about the
 * same pending notification.
 */
async function retryBookingNotifications(today: string): Promise<{
  confirmations: RetryOutcome;
  reschedules: RetryOutcome;
  unrecognised: RetryOutcome;
}> {
  const originalSchedules = alias(schedules, "original_schedules");

  const pending = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    // The bundle the booking was funded from, when there is one: an email has to
    // know a credit was spent, or it sends a cash price nobody paid.
    .leftJoin(bundles, eq(bookings.bundleId, bundles.id))
    // The class it was moved off, for a note that has to name where it moved from.
    .leftJoin(
      originalSchedules,
      eq(bookings.originalScheduleId, originalSchedules.id),
    )
    .where(stillOwedANotification());

  const confirmations = nothing();
  const reschedules = nothing();
  const unrecognised = nothing();

  for (const row of pending) {
    const kind = recognisedKind(row.bookings.emailKind);
    if (kind === null) {
      // Nothing here knows what this row is owed, so it is counted and named
      // rather than passed over — the flag stays false and it keeps its place in
      // tomorrow's sweep, whatever taught it to say this.
      skip(
        unrecognised,
        `booking ${row.bookings.id}`,
        `"${row.bookings.emailKind}" is not a notification this can send`,
      );
      continue;
    }

    const outcome = kind === "reschedule" ? reschedules : confirmations;
    const description =
      kind === "reschedule"
        ? `reschedule notification for booking ${row.bookings.id}`
        : `booking confirmation for booking ${row.bookings.id}`;

    if (hasHappened(row.schedules.date, today)) {
      skip(
        outcome,
        description,
        `the class on ${row.schedules.date} has passed`,
      );
      continue;
    }

    await attempt(
      outcome,
      bookings,
      row.bookings.id,
      description,
      bookingNotificationFor(row, kind),
    );
  }

  return { confirmations, reschedules, unrecognised };
}

/** Confirmations for bundles nobody has been told about. */
async function retryBundleConfirmations(now: Date): Promise<RetryOutcome> {
  const pending = await selectBundlesWithConfig().where(
    eq(bundles.emailSent, false),
  );

  const outcome = nothing();

  for (const row of pending) {
    const description = `bundle confirmation for bundle ${row.bundles.id}`;

    if (new Date(row.bundles.expiresAt).getTime() < now.getTime()) {
      skip(outcome, description, "the bundle has expired");
      continue;
    }

    const product = describeBundleProduct(row);
    if (!product.ok) {
      // Gabrielle was told at purchase time that this bundle has no product
      // behind it; there is nothing here to send and nothing new to say.
      skip(outcome, description, product.error);
      continue;
    }

    await attempt(outcome, bundles, row.bundles.id, description, {
      type: "bundle-purchased",
      customerEmail: product.customerEmail,
      bundleName: product.bundleName,
      credits: product.credits,
      expiryDate: product.expiryDate,
    });
  }

  return outcome;
}

/**
 * "You're on the waiting list" confirmations that did not go out.
 *
 * `waitlistEntries.emailSent` was written by the signup route and read by
 * nothing: a confirmation that failed was lost with nobody able to see it. The
 * count in Gabrielle's copy is read fresh, so it is the list as it stands now
 * rather than as it stood when the signup failed to send.
 */
async function retryWaitlistConfirmations(
  today: string,
): Promise<RetryOutcome> {
  const pending = await db
    .select()
    .from(waitlistEntries)
    .innerJoin(schedules, eq(waitlistEntries.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(eq(waitlistEntries.emailSent, false));

  const outcome = nothing();
  if (pending.length === 0) return outcome;

  const counts = await db
    .select({
      scheduleId: waitlistEntries.scheduleId,
      count: sql<number>`count(*)::int`,
    })
    .from(waitlistEntries)
    .groupBy(waitlistEntries.scheduleId);
  const waitingByScheduleId = new Map(
    counts.map((row) => [row.scheduleId, row.count]),
  );

  for (const row of pending) {
    const description = `waiting-list confirmation for entry ${row.waitlist_entries.id}`;

    if (hasHappened(row.schedules.date, today)) {
      skip(
        outcome,
        description,
        `the class on ${row.schedules.date} has passed`,
      );
      continue;
    }

    const entry = row.waitlist_entries;
    await attempt(outcome, waitlistEntries, entry.id, description, {
      type: "waitlist-joined",
      customerName: entry.customerName,
      customerEmail: entry.customerEmail,
      classTitle: row.classes.title,
      date: row.schedules.date,
      startTime: row.schedules.startTime,
      endTime: row.schedules.endTime,
      location: row.schedules.location,
      waitlistCount: waitingByScheduleId.get(entry.scheduleId) ?? 1,
    });
  }

  return outcome;
}

/**
 * Every pending notification. Each read is guarded on its own, so one of them
 * failing wholesale cannot cost the others their run.
 *
 * `now` is passed in rather than read, so the boundary is testable. Today is
 * Gabrielle's, not the runtime's: a schedule's date is a London wall clock and
 * Vercel runs in UTC.
 */
export async function retryPendingEmails(
  now: Date = new Date(),
): Promise<RetrySweep> {
  const today = londonDateString(now);

  const sweep: RetrySweep = {
    bookingConfirmations: nothing(),
    reschedules: nothing(),
    unrecognised: nothing(),
    bundleConfirmations: nothing(),
    waitlistConfirmations: nothing(),
  };

  try {
    const notifications = await retryBookingNotifications(today);
    sweep.bookingConfirmations = notifications.confirmations;
    sweep.reschedules = notifications.reschedules;
    sweep.unrecognised = notifications.unrecognised;
  } catch (error) {
    console.error("Retry sweep for booking notifications failed:", error);
  }

  const rest = [
    ["bundleConfirmations", () => retryBundleConfirmations(now)],
    ["waitlistConfirmations", () => retryWaitlistConfirmations(today)],
  ] as const;

  for (const [key, run] of rest) {
    try {
      sweep[key] = await run();
    } catch (error) {
      console.error(`Retry sweep for ${key} failed:`, error);
    }
  }

  return sweep;
}

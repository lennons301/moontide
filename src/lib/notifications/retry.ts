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
import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendBundleConfirmation,
  sendRescheduleNotification,
  sendWaitlistConfirmation,
  sendWaitlistNotification,
} from "@/lib/email";
import { markEmailFailed, markEmailSent } from "@/lib/notifications/delivery";
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
  bundleConfirmations: RetryOutcome;
  waitlistConfirmations: RetryOutcome;
};

const nothing = (): RetryOutcome => ({ sent: 0, failed: 0, skipped: 0 });

/**
 * One attempt, with both outcomes recorded. A failure never stops the sweep:
 * the row keeps its flag and its error, and the next run tries it again.
 */
async function attempt(
  outcome: RetryOutcome,
  table: Parameters<typeof markEmailSent>[0],
  id: number,
  description: string,
  send: () => Promise<void>,
): Promise<void> {
  try {
    await send();
    await markEmailSent(table, id);
    outcome.sent++;
  } catch (error) {
    console.error(`Failed to retry ${description}:`, error);
    outcome.failed++;
    await markEmailFailed(table, id, error);
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
 * A booking with a bundle behind it was paid for with a credit, so the retry
 * says so and states the balance. Only a booking with no bundle gets a price.
 */
function paymentFor(row: {
  bundles: { creditsRemaining: number } | null;
  classes: { priceInPence: number };
}) {
  return row.bundles
    ? ({
        method: "credit",
        creditsRemaining: row.bundles.creditsRemaining,
      } as const)
    : ({ method: "card", priceInPence: row.classes.priceInPence } as const);
}

/**
 * Confirmations for bookings nobody has been told about.
 *
 * A held seat is excluded: nobody has taken the offer up, and confirming it
 * would tell them their class is booked when it is not.
 */
async function retryBookingConfirmations(today: string): Promise<RetryOutcome> {
  const pending = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    // The bundle the booking was funded from, when there is one: a retry has to
    // know a credit was spent, or it sends a cash price nobody paid.
    .leftJoin(bundles, eq(bookings.bundleId, bundles.id))
    .where(
      and(
        eq(bookings.emailSent, false),
        ne(bookings.status, "held"),
        eq(bookings.emailKind, "confirmation"),
      ),
    );

  const outcome = nothing();

  for (const row of pending) {
    const description = `booking confirmation for booking ${row.bookings.id}`;

    if (hasHappened(row.schedules.date, today)) {
      skip(
        outcome,
        description,
        `the class on ${row.schedules.date} has passed`,
      );
      continue;
    }

    const payment = paymentFor(row);
    const details = {
      customerName: row.bookings.customerName,
      customerEmail: row.bookings.customerEmail,
      classTitle: row.classes.title,
      date: row.schedules.date,
      startTime: row.schedules.startTime,
      endTime: row.schedules.endTime,
      location: row.schedules.location,
      payment,
    };

    await attempt(outcome, bookings, row.bookings.id, description, async () => {
      await sendBookingConfirmation(details);
      await sendBookingNotification({ type: "individual", ...details });
    });
  }

  return outcome;
}

/**
 * "Your booking has been moved" notes that did not go out when the move was made.
 *
 * The note names the class the booking started on — `originalScheduleId`, which
 * after a chain of moves is where the customer first booked rather than the hop
 * before this one. True either way, and the alternative is a second foreign key
 * to `schedules` recording only the last hop.
 *
 * When that original class has been deleted there is no "from" to name, so the
 * customer gets a plain confirmation of the class they are on instead: accurate,
 * useful, and it means the row leaves the sweep rather than failing nightly for
 * ever on a class that no longer exists.
 */
async function retryReschedules(today: string): Promise<RetryOutcome> {
  const originalSchedules = alias(schedules, "original_schedules");

  const pending = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .leftJoin(bundles, eq(bookings.bundleId, bundles.id))
    .leftJoin(
      originalSchedules,
      eq(bookings.originalScheduleId, originalSchedules.id),
    )
    .where(
      and(
        eq(bookings.emailSent, false),
        ne(bookings.status, "held"),
        eq(bookings.emailKind, "reschedule"),
      ),
    );

  const outcome = nothing();

  for (const row of pending) {
    const description = `reschedule notification for booking ${row.bookings.id}`;

    if (hasHappened(row.schedules.date, today)) {
      skip(
        outcome,
        description,
        `the class on ${row.schedules.date} has passed`,
      );
      continue;
    }

    const from = row.original_schedules;

    await attempt(outcome, bookings, row.bookings.id, description, async () => {
      if (!from) {
        await sendBookingConfirmation({
          customerName: row.bookings.customerName,
          customerEmail: row.bookings.customerEmail,
          classTitle: row.classes.title,
          date: row.schedules.date,
          startTime: row.schedules.startTime,
          endTime: row.schedules.endTime,
          location: row.schedules.location,
          payment: paymentFor(row),
        });
        return;
      }

      await sendRescheduleNotification({
        customerName: row.bookings.customerName,
        customerEmail: row.bookings.customerEmail,
        classTitle: row.classes.title,
        oldDate: from.date,
        oldStartTime: from.startTime,
        oldEndTime: from.endTime,
        newDate: row.schedules.date,
        newStartTime: row.schedules.startTime,
        newEndTime: row.schedules.endTime,
        newLocation: row.schedules.location,
      });
    });
  }

  return outcome;
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

    await attempt(outcome, bundles, row.bundles.id, description, async () => {
      await sendBundleConfirmation({
        customerEmail: product.customerEmail,
        bundleName: product.bundleName,
        credits: product.credits,
        expiryDate: product.expiryDate,
      });
      await sendBookingNotification({
        type: "bundle",
        customerEmail: product.customerEmail,
        bundleName: product.bundleName,
        credits: product.credits,
        expiryDate: product.expiryDate,
      });
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
    await attempt(outcome, waitlistEntries, entry.id, description, async () => {
      await sendWaitlistConfirmation({
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        classTitle: row.classes.title,
        date: row.schedules.date,
        startTime: row.schedules.startTime,
        endTime: row.schedules.endTime,
        location: row.schedules.location,
      });
      await sendWaitlistNotification({
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        classTitle: row.classes.title,
        date: row.schedules.date,
        startTime: row.schedules.startTime,
        endTime: row.schedules.endTime,
        waitlistCount: waitingByScheduleId.get(entry.scheduleId) ?? 1,
      });
    });
  }

  return outcome;
}

/**
 * Every kind of pending notification, each guarded on its own so one kind
 * failing wholesale cannot cost another kind its run.
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
    bundleConfirmations: nothing(),
    waitlistConfirmations: nothing(),
  };

  const kinds = [
    ["bookingConfirmations", () => retryBookingConfirmations(today)],
    ["reschedules", () => retryReschedules(today)],
    ["bundleConfirmations", () => retryBundleConfirmations(now)],
    ["waitlistConfirmations", () => retryWaitlistConfirmations(today)],
  ] as const;

  for (const [key, run] of kinds) {
    try {
      sweep[key] = await run();
    } catch (error) {
      console.error(`Retry sweep for ${key} failed:`, error);
    }
  }

  return sweep;
}

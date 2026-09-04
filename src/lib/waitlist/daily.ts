import { and, eq, gte, isNotNull, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, classes, schedules, waitlistEntries } from "@/lib/db/schema";
import { sendOfferDigest, sendOfferExpired } from "@/lib/email";
import { londonDateString } from "@/lib/time/london";
import type {
  DigestOffer,
  DigestReleasedBooking,
  DigestSchedule,
} from "@/lib/waitlist/digest";
import { buildAdminDigest } from "@/lib/waitlist/digest";
import { releaseHeldSeat } from "@/lib/waitlist/settlement";

/**
 * The daily work on seat offers: settle the ones nobody answered, then tell
 * Gabrielle what is waiting on her.
 *
 * Folded into the existing daily cron handler rather than given a schedule of
 * its own — this plan permits only daily schedules, and the number of entries it
 * permits is not something we could confirm, so the work goes where a daily run
 * already happens.
 *
 * Punctuality is not load-bearing. Every reader of an offer already treats one
 * past its deadline as expired, so a late or missed run delays this email and
 * this digest and changes no decision. Nothing here advances a waiting list
 * either: no offer is ever sent without Gabrielle deciding to send it.
 */

/**
 * Offers whose deadline has passed and whose seat is still held.
 *
 * Guarded on `held`, which is also what keeps this off the cancellation path: a
 * cancelled class has already had its held bookings cancelled and its seats
 * given back, so nothing here touches them, and the waiting-list entry it
 * deliberately left intact — token included — stays intact.
 */
async function findExpiredOffers(now: Date) {
  return await db
    .select({
      entryId: waitlistEntries.id,
      scheduleId: waitlistEntries.scheduleId,
      heldBookingId: waitlistEntries.heldBookingId,
      customerName: waitlistEntries.customerName,
      customerEmail: waitlistEntries.customerEmail,
      classTitle: classes.title,
      date: schedules.date,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
    })
    .from(waitlistEntries)
    .innerJoin(bookings, eq(waitlistEntries.heldBookingId, bookings.id))
    .innerJoin(schedules, eq(waitlistEntries.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(
      and(
        eq(bookings.status, "held"),
        lte(waitlistEntries.offerExpiresAt, now),
      ),
    );
}

export type ExpirySweep = {
  found: number;
  released: number;
  emailed: number;
  failed: number;
};

/**
 * Give back the seats of offers nobody answered, and tell each person once.
 *
 * The same path a withdrawal takes (`releaseHeldSeat`), so the two end in the
 * same state: seat free, person still on the waiting list. The only differences
 * are what triggered it and that this one writes to the customer — a withdrawal
 * sends nothing, because Gabrielle has already replied to them herself.
 */
export async function settleExpiredOffers(now: Date): Promise<ExpirySweep> {
  const expired = await findExpiredOffers(now);

  let released = 0;
  let emailed = 0;
  let failed = 0;

  for (const offer of expired) {
    const heldBookingId = offer.heldBookingId;
    if (heldBookingId === null) continue;

    try {
      const outcome = await db.transaction((tx) =>
        releaseHeldSeat(tx, {
          entryId: offer.entryId,
          heldBookingId,
          scheduleId: offer.scheduleId,
        }),
      );

      // The seat was taken up between the read and the write: they are coming to
      // the class, so there is nothing to release and nothing to tell them.
      if (!outcome.released) continue;
      released++;

      await sendOfferExpired({
        customerName: offer.customerName,
        customerEmail: offer.customerEmail,
        classTitle: offer.classTitle,
        date: offer.date,
        startTime: offer.startTime,
        endTime: offer.endTime,
      });
      emailed++;
    } catch (error) {
      // One offer failing must not strand the rest of the sweep. A send that
      // failed after the seat came back is not retried: the offer is gone, so
      // there is nothing left to be consistent with.
      console.error(
        `Failed to settle expired offer on waitlist entry ${offer.entryId}:`,
        error,
      );
      failed++;
    }
  }

  return { found: expired.length, released, emailed, failed };
}

/** Upcoming, uncancelled classes with their waiting lists and their offers. */
async function readDigestSchedules(now: Date): Promise<DigestSchedule[]> {
  const scheduleRows = await db
    .select({
      scheduleId: schedules.id,
      classTitle: classes.title,
      date: schedules.date,
      startTime: schedules.startTime,
      endTime: schedules.endTime,
      capacity: schedules.capacity,
      bookedCount: schedules.bookedCount,
    })
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    // A cancelled class needs nothing from her, and a past one cannot be acted
    // on. The date is a London wall clock, so today is London's today; classes
    // earlier today are dropped by `buildAdminDigest` against the start time.
    .where(
      and(
        gte(schedules.date, londonDateString(now)),
        ne(schedules.status, "cancelled"),
      ),
    );

  const entryRows = await db
    .select({
      scheduleId: waitlistEntries.scheduleId,
      customerName: waitlistEntries.customerName,
      customerEmail: waitlistEntries.customerEmail,
      offerExpiresAt: waitlistEntries.offerExpiresAt,
      heldBookingId: waitlistEntries.heldBookingId,
      heldBookingStatus: bookings.status,
    })
    .from(waitlistEntries)
    .leftJoin(bookings, eq(waitlistEntries.heldBookingId, bookings.id));

  const waitingByScheduleId = new Map<number, number>();
  const offersByScheduleId = new Map<number, DigestOffer[]>();

  for (const entry of entryRows) {
    waitingByScheduleId.set(
      entry.scheduleId,
      (waitingByScheduleId.get(entry.scheduleId) ?? 0) + 1,
    );

    // Whether the deadline has passed is decided by `buildAdminDigest`, not
    // here: this only reports which seats an offer is sitting on.
    if (entry.heldBookingId !== null && entry.heldBookingStatus === "held") {
      const offers = offersByScheduleId.get(entry.scheduleId) ?? [];
      offers.push({
        customerName: entry.customerName,
        customerEmail: entry.customerEmail,
        expiresAt: entry.offerExpiresAt,
      });
      offersByScheduleId.set(entry.scheduleId, offers);
    }
  }

  return scheduleRows.map((row) => ({
    ...row,
    waitingCount: waitingByScheduleId.get(row.scheduleId) ?? 0,
    offers: offersByScheduleId.get(row.scheduleId) ?? [],
  }));
}

/**
 * Card payers whose seat was handed back and not yet replaced.
 *
 * `released` is only ever card-funded: a bundle-funded release is cancelled and
 * its credit returned, and a rescheduled one goes back to `confirmed` with
 * `releasedAt` cleared. So this status is the whole "owed a class" list.
 */
async function readReleasedBookings(): Promise<DigestReleasedBooking[]> {
  const rows = await db
    .select({
      bookingId: bookings.id,
      customerName: bookings.customerName,
      customerEmail: bookings.customerEmail,
      classTitle: classes.title,
      date: schedules.date,
      releasedAt: bookings.releasedAt,
    })
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(
      and(eq(bookings.status, "released"), isNotNull(bookings.releasedAt)),
    );

  return rows.flatMap((row) =>
    row.releasedAt ? [{ ...row, releasedAt: row.releasedAt }] : [],
  );
}

/**
 * Send the digest, unless nothing needs her.
 *
 * The suppression is the point: an email from this job always means something is
 * waiting, so it keeps meaning something when it arrives.
 *
 * No delivery state and no retry, deliberately: the digest is rebuilt from live
 * state every run, so a failed one is not resent — it is superseded tomorrow by
 * a digest saying whatever is true then. Retrying yesterday's would be sending
 * her a list that has already moved on.
 */
export async function sendDigestIfAnythingNeedsHer(
  now: Date,
): Promise<{ sent: boolean; items: number }> {
  const digest = buildAdminDigest({
    schedules: await readDigestSchedules(now),
    released: await readReleasedBookings(),
    now,
  });

  const items =
    digest.seatsToOffer.length +
    digest.offersOutstanding.length +
    digest.owedAClass.length;

  if (digest.isEmpty) return { sent: false, items: 0 };

  await sendOfferDigest(digest);
  return { sent: true, items };
}

export type DailyOfferWork = {
  expiredOffers: ExpirySweep | null;
  digest: { sent: boolean; items: number } | null;
};

/**
 * Both pieces of daily offer work, in the order that makes the digest tell the
 * truth: a seat freed by settling is a seat with nobody on it, which is exactly
 * what the digest is prompting her about.
 *
 * Each piece is guarded on its own so one failing does not take the other with
 * it, and neither takes down the handler it is folded into.
 */
export async function runDailyOfferWork(
  now: Date = new Date(),
): Promise<DailyOfferWork> {
  let expiredOffers: ExpirySweep | null = null;
  let digest: { sent: boolean; items: number } | null = null;

  try {
    expiredOffers = await settleExpiredOffers(now);
  } catch (error) {
    console.error("Expired offer sweep failed:", error);
  }

  try {
    digest = await sendDigestIfAnythingNeedsHer(now);
  } catch (error) {
    console.error("Daily offer digest failed:", error);
  }

  return { expiredOffers, digest };
}

import { londonWallClockToUtc } from "@/lib/time/london";
import { hasOfferLapsed } from "@/lib/waitlist/offers";

/**
 * Pure decision seam for Gabrielle's daily digest.
 *
 * Three things in this milestone quietly wait on her: a free seat on a class
 * people are waiting for with nobody offered it, an offer running out, and a
 * card payer released weeks ago who still has not been moved to a new date. All
 * three are visible in the admin if she looks; none reaches her if she doesn't.
 *
 * The digest only ever prompts. Nothing here advances a waiting list or sends an
 * offer — she may skip someone for reasons the system cannot know, so every
 * offer stays her decision.
 *
 * Deadlines are read against `now`, never against whether the settling job has
 * run: an offer past its deadline is lapsed, so the seat it holds counts as one
 * with nobody on it and the person holding it counts as waiting again. A late
 * run therefore delays the prompt without changing what the prompt says.
 */

/** "More than roughly a week ago" for the owed-a-class section. */
export const OWED_A_CLASS_AFTER_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type DigestOffer = {
  customerName: string;
  customerEmail: string;
  /** Null holds nothing: an offer with no deadline is treated as lapsed. */
  expiresAt: Date | null;
};

/** One upcoming, uncancelled class with its waiting list and its offers. */
export type DigestSchedule = {
  scheduleId: number;
  classTitle: string;
  /** `YYYY-MM-DD`, London wall clock, as stored. */
  date: string;
  /** `HH:MM[:SS]`, London wall clock, as stored. */
  startTime: string;
  endTime: string;
  capacity: number;
  /** Every seat taken, held ones included. */
  bookedCount: number;
  /** Everyone on the waiting list, whether or not they hold an offer. */
  waitingCount: number;
  /** Seats currently held by an offer — lapsed ones included. */
  offers: DigestOffer[];
};

/** A card payer whose seat was handed back and never replaced. */
export type DigestReleasedBooking = {
  bookingId: number;
  customerName: string;
  customerEmail: string;
  classTitle: string;
  /** The date they were released from. */
  date: string;
  releasedAt: Date;
};

export type SeatToOffer = {
  scheduleId: number;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Seats with nobody working on them. */
  freeSeats: number;
  /** People on the list who hold no offer — the ones she could offer it to. */
  waitingCount: number;
};

export type OutstandingOffer = {
  scheduleId: number;
  classTitle: string;
  date: string;
  startTime: string;
  customerName: string;
  customerEmail: string;
  expiresAt: Date;
};

export type OwedAClass = {
  bookingId: number;
  customerName: string;
  customerEmail: string;
  classTitle: string;
  date: string;
  releasedAt: Date;
  /** Whole days since the seat was handed back. */
  daysSince: number;
};

export type AdminDigest = {
  seatsToOffer: SeatToOffer[];
  offersOutstanding: OutstandingOffer[];
  owedAClass: OwedAClass[];
  /** Nothing needs her. The digest is not sent at all — see below. */
  isEmpty: boolean;
};

/**
 * Decide what belongs in the digest.
 *
 * `isEmpty` is the suppression rule: an empty digest is not sent, so an email
 * from this job always means something is waiting on her. A digest that arrived
 * daily saying "nothing to do" would stop being read, and the one that mattered
 * would go with it.
 */
export function buildAdminDigest(input: {
  /** Upcoming, uncancelled classes. Ones already started are dropped here. */
  schedules: DigestSchedule[];
  released: DigestReleasedBooking[];
  now: Date;
}): AdminDigest {
  const { schedules, released, now } = input;

  const upcoming = schedules
    .map((schedule) => ({
      schedule,
      startsAt: londonWallClockToUtc(schedule.date, schedule.startTime),
    }))
    .filter(({ startsAt }) => startsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const seatsToOffer: SeatToOffer[] = [];
  const offersOutstanding: OutstandingOffer[] = [];

  for (const { schedule } of upcoming) {
    const live = schedule.offers.filter(
      (offer): offer is DigestOffer & { expiresAt: Date } =>
        !hasOfferLapsed(offer.expiresAt, now),
    );
    const lapsed = schedule.offers.length - live.length;

    // A lapsed offer is holding a seat that is on its way back, and the person
    // holding it is waiting again, so both sides count towards the prompt.
    const freeSeats =
      Math.max(0, schedule.capacity - schedule.bookedCount) + lapsed;
    const waitingWithoutOffer = Math.max(
      0,
      schedule.waitingCount - live.length,
    );

    if (freeSeats > 0 && waitingWithoutOffer > 0) {
      seatsToOffer.push({
        scheduleId: schedule.scheduleId,
        classTitle: schedule.classTitle,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        freeSeats,
        waitingCount: waitingWithoutOffer,
      });
    }

    for (const offer of live) {
      offersOutstanding.push({
        scheduleId: schedule.scheduleId,
        classTitle: schedule.classTitle,
        date: schedule.date,
        startTime: schedule.startTime,
        customerName: offer.customerName,
        customerEmail: offer.customerEmail,
        expiresAt: offer.expiresAt,
      });
    }
  }

  // Soonest deadline first: these are the ones about to run out.
  offersOutstanding.sort(
    (a, b) => a.expiresAt.getTime() - b.expiresAt.getTime(),
  );

  const owedCutoff = now.getTime() - OWED_A_CLASS_AFTER_DAYS * DAY_MS;
  const owedAClass = released
    .filter((booking) => booking.releasedAt.getTime() <= owedCutoff)
    .map((booking) => ({
      ...booking,
      daysSince: Math.floor(
        (now.getTime() - booking.releasedAt.getTime()) / DAY_MS,
      ),
    }))
    // Longest wait first: the person owed a class for a month comes before the
    // one owed since last week.
    .sort((a, b) => a.releasedAt.getTime() - b.releasedAt.getTime());

  return {
    seatsToOffer,
    offersOutstanding,
    owedAClass,
    isEmpty:
      seatsToOffer.length === 0 &&
      offersOutstanding.length === 0 &&
      owedAClass.length === 0,
  };
}

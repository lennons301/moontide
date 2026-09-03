import { describe, expect, it } from "vitest";
import type {
  DigestReleasedBooking,
  DigestSchedule,
} from "@/lib/waitlist/digest";
import { buildAdminDigest } from "@/lib/waitlist/digest";

const NOW = new Date("2026-06-10T09:00:00.000Z");

function schedule(overrides: Partial<DigestSchedule> = {}): DigestSchedule {
  return {
    scheduleId: 42,
    classTitle: "Prenatal Yoga",
    date: "2026-06-20",
    startTime: "10:00:00",
    endTime: "11:00:00",
    status: "open",
    capacity: 8,
    bookedCount: 8,
    waitingCount: 0,
    offers: [],
    ...overrides,
  };
}

function released(
  overrides: Partial<DigestReleasedBooking> = {},
): DigestReleasedBooking {
  return {
    bookingId: 7,
    customerName: "Priya Shah",
    customerEmail: "priya@example.com",
    classTitle: "Vinyasa",
    date: "2026-05-01",
    releasedAt: new Date("2026-05-02T09:00:00.000Z"),
    ...overrides,
  };
}

describe("buildAdminDigest", () => {
  describe("free seats with people waiting", () => {
    it("prompts her when a seat is free and someone is waiting for it", () => {
      const digest = buildAdminDigest({
        schedules: [schedule({ bookedCount: 6, waitingCount: 3 })],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer).toEqual([
        {
          scheduleId: 42,
          classTitle: "Prenatal Yoga",
          date: "2026-06-20",
          startTime: "10:00:00",
          endTime: "11:00:00",
          freeSeats: 2,
          waitingCount: 3,
        },
      ]);
    });

    it("says nothing about a free seat nobody is waiting for", () => {
      const digest = buildAdminDigest({
        schedules: [schedule({ bookedCount: 4, waitingCount: 0 })],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer).toEqual([]);
      expect(digest.isEmpty).toBe(true);
    });

    it("says nothing about a full class with a waiting list", () => {
      const digest = buildAdminDigest({
        schedules: [schedule({ bookedCount: 8, waitingCount: 4 })],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer).toEqual([]);
    });

    it("leaves out the seat an outstanding offer is already working on", () => {
      // One free seat, one offer out against it: there is nothing left to hold,
      // and nothing for her to do until that offer answers or lapses.
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            bookedCount: 8,
            waitingCount: 1,
            offers: [
              {
                customerName: "Jane Doe",
                customerEmail: "jane@example.com",
                expiresAt: new Date("2026-06-11T09:00:00.000Z"),
              },
            ],
          }),
        ],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer).toEqual([]);
      expect(digest.offersOutstanding).toHaveLength(1);
    });

    it("counts a lapsed offer's seat as free and its holder as waiting again", () => {
      // Nothing depends on the settling job having run: past the deadline the
      // seat is free and the person is back on the list, so the prompt is the
      // same whether the job ran an hour ago or not at all.
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            bookedCount: 8,
            waitingCount: 1,
            offers: [
              {
                customerName: "Jane Doe",
                customerEmail: "jane@example.com",
                expiresAt: new Date("2026-06-09T09:00:00.000Z"),
              },
            ],
          }),
        ],
        released: [],
        now: NOW,
      });

      expect(digest.offersOutstanding).toEqual([]);
      expect(digest.seatsToOffer).toEqual([
        expect.objectContaining({ freeSeats: 1, waitingCount: 1 }),
      ]);
    });

    it("treats an offer with no deadline as lapsed", () => {
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            bookedCount: 8,
            waitingCount: 1,
            offers: [
              {
                customerName: "Jane Doe",
                customerEmail: "jane@example.com",
                expiresAt: null,
              },
            ],
          }),
        ],
        released: [],
        now: NOW,
      });

      expect(digest.offersOutstanding).toEqual([]);
      expect(digest.seatsToOffer).toHaveLength(1);
    });

    it("never reports negative free seats on an oversold class", () => {
      const digest = buildAdminDigest({
        schedules: [schedule({ capacity: 8, bookedCount: 9, waitingCount: 2 })],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer).toEqual([]);
    });

    it("leaves out a class that has already started", () => {
      // A seat on a class that has begun is not something she can act on.
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            date: "2026-06-10",
            startTime: "09:00:00",
            bookedCount: 4,
            waitingCount: 2,
          }),
        ],
        released: [],
        now: NOW,
      });

      // 09:00 London on 10 June is 08:00Z — an hour before `now`, through BST.
      expect(digest.seatsToOffer).toEqual([]);
      expect(digest.isEmpty).toBe(true);
    });

    it("keeps a class starting later today", () => {
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            date: "2026-06-10",
            startTime: "18:00:00",
            bookedCount: 4,
            waitingCount: 2,
          }),
        ],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer).toHaveLength(1);
    });

    it("puts the soonest class first", () => {
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            scheduleId: 2,
            date: "2026-07-01",
            bookedCount: 4,
            waitingCount: 1,
          }),
          schedule({
            scheduleId: 1,
            date: "2026-06-12",
            bookedCount: 4,
            waitingCount: 1,
          }),
        ],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer.map((s) => s.scheduleId)).toEqual([1, 2]);
    });
  });

  describe("offers still outstanding", () => {
    it("reports each one with its deadline, soonest first", () => {
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            scheduleId: 1,
            date: "2026-06-12",
            bookedCount: 8,
            waitingCount: 2,
            offers: [
              {
                customerName: "Jane Doe",
                customerEmail: "jane@example.com",
                expiresAt: new Date("2026-06-12T08:00:00.000Z"),
              },
            ],
          }),
          schedule({
            scheduleId: 2,
            date: "2026-06-11",
            bookedCount: 8,
            waitingCount: 1,
            offers: [
              {
                customerName: "Amy Bell",
                customerEmail: "amy@example.com",
                expiresAt: new Date("2026-06-10T17:00:00.000Z"),
              },
            ],
          }),
        ],
        released: [],
        now: NOW,
      });

      expect(
        digest.offersOutstanding.map((o) => [o.customerName, o.scheduleId]),
      ).toEqual([
        ["Amy Bell", 2],
        ["Jane Doe", 1],
      ]);
      expect(digest.offersOutstanding[0].expiresAt).toEqual(
        new Date("2026-06-10T17:00:00.000Z"),
      );
    });
  });

  // Closing a class stops new bookings and retires nothing: `PUT
  // /api/admin/schedules` voids held bookings only on the cancelled branch. So
  // an offer made before she closed the class is still outstanding, and the
  // digest is the only thing that tells her so.
  describe("a class she has closed", () => {
    it("still reports an offer nobody has answered on it", () => {
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            status: "closed",
            bookedCount: 8,
            waitingCount: 2,
            offers: [
              {
                customerName: "Jane Doe",
                customerEmail: "jane@example.com",
                expiresAt: new Date("2026-06-12T08:00:00.000Z"),
              },
            ],
          }),
        ],
        released: [],
        now: NOW,
      });

      expect(
        digest.offersOutstanding.map((o) => [o.customerName, o.scheduleId]),
      ).toEqual([["Jane Doe", 42]]);
      expect(digest.isEmpty).toBe(false);
    });

    it("does not prompt her to offer its free seats", () => {
      const digest = buildAdminDigest({
        schedules: [
          schedule({ status: "closed", bookedCount: 4, waitingCount: 3 }),
        ],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer).toEqual([]);
      expect(digest.isEmpty).toBe(true);
    });

    it("prompts her about the same seats once it is open again", () => {
      const digest = buildAdminDigest({
        schedules: [
          schedule({ status: "open", bookedCount: 4, waitingCount: 3 }),
        ],
        released: [],
        now: NOW,
      });

      expect(digest.seatsToOffer.map((s) => s.freeSeats)).toEqual([4]);
    });

    it("says nothing about a lapsed offer on it, seats or otherwise", () => {
      const digest = buildAdminDigest({
        schedules: [
          schedule({
            status: "closed",
            bookedCount: 8,
            waitingCount: 1,
            offers: [
              {
                customerName: "Jane Doe",
                customerEmail: "jane@example.com",
                expiresAt: new Date("2026-06-09T08:00:00.000Z"),
              },
            ],
          }),
        ],
        released: [],
        now: NOW,
      });

      expect(digest.offersOutstanding).toEqual([]);
      expect(digest.seatsToOffer).toEqual([]);
      expect(digest.isEmpty).toBe(true);
    });
  });

  describe("card payers owed a class", () => {
    it("reports one released more than a week ago", () => {
      const digest = buildAdminDigest({
        schedules: [],
        released: [released({ releasedAt: new Date("2026-05-02T09:00:00Z") })],
        now: NOW,
      });

      expect(digest.owedAClass).toEqual([
        expect.objectContaining({ bookingId: 7, daysSince: 39 }),
      ]);
    });

    it("leaves a recent release alone", () => {
      // She released this one yesterday; she does not need chasing about it.
      const digest = buildAdminDigest({
        schedules: [],
        released: [released({ releasedAt: new Date("2026-06-09T09:00:00Z") })],
        now: NOW,
      });

      expect(digest.owedAClass).toEqual([]);
      expect(digest.isEmpty).toBe(true);
    });

    it("puts the longest wait first", () => {
      const digest = buildAdminDigest({
        schedules: [],
        released: [
          released({
            bookingId: 2,
            releasedAt: new Date("2026-06-01T09:00:00Z"),
          }),
          released({
            bookingId: 1,
            releasedAt: new Date("2026-04-01T09:00:00Z"),
          }),
        ],
        now: NOW,
      });

      expect(digest.owedAClass.map((b) => b.bookingId)).toEqual([1, 2]);
    });
  });

  describe("suppression", () => {
    it("is empty when nothing needs her", () => {
      const digest = buildAdminDigest({
        schedules: [schedule({ bookedCount: 8, waitingCount: 0 })],
        released: [],
        now: NOW,
      });

      expect(digest.isEmpty).toBe(true);
    });

    it("is not empty when any one section has something in it", () => {
      const seats = buildAdminDigest({
        schedules: [schedule({ bookedCount: 7, waitingCount: 1 })],
        released: [],
        now: NOW,
      });
      const offers = buildAdminDigest({
        schedules: [
          schedule({
            bookedCount: 8,
            waitingCount: 1,
            offers: [
              {
                customerName: "Jane Doe",
                customerEmail: "jane@example.com",
                expiresAt: new Date("2026-06-11T09:00:00.000Z"),
              },
            ],
          }),
        ],
        released: [],
        now: NOW,
      });
      const owed = buildAdminDigest({
        schedules: [],
        released: [released()],
        now: NOW,
      });

      expect([seats.isEmpty, offers.isEmpty, owed.isEmpty]).toEqual([
        false,
        false,
        false,
      ]);
    });
  });
});

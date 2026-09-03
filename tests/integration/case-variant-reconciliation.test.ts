import { readFileSync } from "node:fs";
import { asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bookings, schedules, waitlistEntries } from "@/lib/db/schema";
import { violatedConstraint } from "./support/constraints";
import { createBooking, createSchedule } from "./support/factories";

/**
 * The migration that makes the uniqueness indexes case-insensitive has to be
 * applicable to a database that already holds the duplicates it forbids —
 * otherwise it is a deploy that dies on production data and nowhere else.
 *
 * So the reconciliation runs here against real rows: the previous indexes are
 * put back, case-variant duplicates are made under them, and the migration is
 * applied exactly as the deploy would apply it.
 */

const MIGRATION = readFileSync(
  "drizzle/migrations/0017_case_insensitive_customer_email.sql",
  "utf8",
);

async function applyTheMigration() {
  for (const statement of MIGRATION.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.execute(sql.raw(statement));
  }
}

/** The indexes as they stood before: on the raw column, so `Ada@` slips past. */
async function restoreThePreviousIndexes() {
  await db.execute(
    sql`DROP INDEX IF EXISTS "bookings_schedule_email_active_idx"`,
  );
  await db.execute(sql`DROP INDEX IF EXISTS "waitlist_schedule_email_idx"`);
  await db.execute(
    sql`CREATE UNIQUE INDEX "bookings_schedule_email_active_idx" ON "bookings" USING btree ("schedule_id","customer_email") WHERE "bookings"."status" <> 'cancelled'`,
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX "waitlist_schedule_email_idx" ON "waitlist_entries" USING btree ("schedule_id","customer_email")`,
  );
}

async function bookingsOn(scheduleId: number) {
  return await db
    .select()
    .from(bookings)
    .where(eq(bookings.scheduleId, scheduleId))
    .orderBy(asc(bookings.id));
}

async function seatsTaken(scheduleId: number) {
  const [row] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, scheduleId));
  return row.bookedCount;
}

beforeEach(restoreThePreviousIndexes);

describe("applying the case-insensitive indexes to rows that predate them", () => {
  it("keeps the first booking, cancels the later one and gives its seat back", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 2 });
    const first = await createBooking({
      scheduleId: schedule.id,
      customerEmail: "Ada@example.com",
    });
    const second = await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
    });

    await applyTheMigration();

    expect(await bookingsOn(schedule.id)).toMatchObject([
      { id: first.id, status: "confirmed" },
      { id: second.id, status: "cancelled" },
    ]);
    // One person, one seat: the second was never a real place in the room.
    expect(await seatsTaken(schedule.id)).toBe(1);
  });

  it("takes no seat back for a duplicate that was already released", async () => {
    // A released booking handed its seat back when it was released, so the
    // occupancy count no longer includes it. Freeing it again would invent a
    // place the class does not have.
    const schedule = await createSchedule({ capacity: 8, bookedCount: 1 });
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "Ada@example.com",
    });
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
      status: "released",
      releasedAt: new Date("2026-02-01T00:00:00Z"),
    });

    await applyTheMigration();

    expect(await seatsTaken(schedule.id)).toBe(1);
  });

  it("leaves a customer's one booking, and two customers', alone", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 2 });
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "Ada@example.com",
    });
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "grace@example.com",
    });

    await applyTheMigration();

    expect(
      (await bookingsOn(schedule.id)).map((booking) => booking.status),
    ).toEqual(["confirmed", "confirmed"]);
    expect(await seatsTaken(schedule.id)).toBe(2);
  });

  it("keeps the waiting-list place that holds an offer, not merely the older one", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 1 });
    const held = await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
      status: "held",
    });
    const [older] = await db
      .insert(waitlistEntries)
      .values({
        scheduleId: schedule.id,
        customerName: "Ada",
        customerEmail: "Ada@example.com",
      })
      .returning();
    const [offered] = await db
      .insert(waitlistEntries)
      .values({
        scheduleId: schedule.id,
        customerName: "Ada",
        customerEmail: "ada@example.com",
        offeredAt: new Date("2026-02-01T00:00:00Z"),
        offerExpiresAt: new Date("2026-02-03T00:00:00Z"),
        offerToken: "tok-ada",
        heldBookingId: held.id,
      })
      .returning();

    await applyTheMigration();

    // Deleting the entry with the offer on it would orphan the seat being held
    // for her — the older row is the one that goes.
    const remaining = await db.select().from(waitlistEntries);
    expect(remaining.map((entry) => entry.id)).toEqual([offered.id]);
    expect(remaining[0].offerToken).toBe("tok-ada");
    expect(older.id).toBeLessThan(offered.id);
  });

  it("keeps the earliest waiting-list place when neither holds an offer", async () => {
    const schedule = await createSchedule({ capacity: 8 });
    const [first] = await db
      .insert(waitlistEntries)
      .values({
        scheduleId: schedule.id,
        customerName: "Ada",
        customerEmail: "ADA@example.com",
      })
      .returning();
    await db.insert(waitlistEntries).values({
      scheduleId: schedule.id,
      customerName: "Ada",
      customerEmail: "ada@example.com",
    });

    await applyTheMigration();

    const remaining = await db.select().from(waitlistEntries);
    expect(remaining.map((entry) => entry.id)).toEqual([first.id]);
  });

  it("leaves the stricter indexes behind, and can be applied twice", async () => {
    const schedule = await createSchedule({ capacity: 8, bookedCount: 2 });
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "Ada@example.com",
    });
    await createBooking({
      scheduleId: schedule.id,
      customerEmail: "ada@example.com",
    });

    await applyTheMigration();
    // A renumbered migration is offered again to a database that has already
    // run it, so the second run has to be a no-op rather than a dead deploy.
    await applyTheMigration();

    expect(await seatsTaken(schedule.id)).toBe(1);
    expect(
      await violatedConstraint(
        createBooking({
          scheduleId: schedule.id,
          customerEmail: "ADA@example.com",
        }),
      ),
    ).toBe("bookings_schedule_email_active_idx");
  });
});

import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { holdsAPlace } from "@/lib/bookings/transitions";
import { db } from "@/lib/db";
import { bookings, classes, schedules, waitlistEntries } from "@/lib/db/schema";
import { SCHEDULE_STATUSES } from "@/lib/schedules/availability";
import { voidOffersOnCancellation } from "@/lib/waitlist/cancellation";
import { ApiError, withAdmin } from "../_lib";

export const GET = withAdmin({}, async () => {
  const scheduleRows = await db
    .select()
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .orderBy(desc(schedules.date));

  const counts = await db
    .select({
      scheduleId: waitlistEntries.scheduleId,
      count: sql<number>`count(*)::int`,
    })
    .from(waitlistEntries)
    .groupBy(waitlistEntries.scheduleId);

  // Held seats are inside bookedCount, but nobody has paid for them and nobody
  // is coming on them yet — a class reading as full must not mislead about who
  // is actually attending.
  const heldCounts = await db
    .select({
      scheduleId: bookings.scheduleId,
      count: sql<number>`count(*)::int`,
    })
    .from(bookings)
    .where(eq(bookings.status, "held"))
    .groupBy(bookings.scheduleId);

  const countByScheduleId = new Map<number, number>(
    counts.map((c) => [c.scheduleId, c.count]),
  );
  const heldByScheduleId = new Map<number, number>(
    heldCounts.map((c) => [c.scheduleId, c.count]),
  );

  const enriched = scheduleRows.map((row) => ({
    ...row,
    waitlistCount: countByScheduleId.get(row.schedules.id) ?? 0,
    heldCount: heldByScheduleId.get(row.schedules.id) ?? 0,
  }));

  return NextResponse.json(enriched);
});

const missingFields = { error: "Missing required fields" };
const missingId = { error: "Missing schedule ID" };
const badCapacity = { error: "Capacity must be a whole number of seats" };
const badWeeks = { error: "Number of weeks must be a whole number" };
/**
 * A year of weekly classes is as far ahead as Gabrielle ever sets a class up,
 * and it is what the form's `max` already offers. Without a bound the count is
 * a row count: every week asked for becomes a schedule in one insert.
 */
const MAX_WEEKS = 52;
const tooManyWeeks = {
  error: `Number of weeks cannot be more than ${MAX_WEEKS}`,
};
const badLocation = { error: "Location must be text" };
const badRepeat = { error: "Repeat weekly must be true or false" };

const scheduleId = z.number(missingId).int(missingId).positive(missingId);

/**
 * Zero is accepted, not refused. The capacity box on `/admin/schedule` is not
 * required, so clearing it sends `Number("") === 0`, and both handlers already
 * read that as "use the default" (`capacity || 8`) or "leave it alone"
 * (`...(capacity && …)`). Refusing it here would fail the whole edit — silently,
 * because the form only reacts to success.
 */
const seatCount = z
  .number(badCapacity)
  .int(badCapacity)
  .nonnegative(badCapacity);
const weekCount = z
  .number(badWeeks)
  .int(badWeeks)
  .nonnegative(badWeeks)
  .max(MAX_WEEKS, tooManyWeeks);

const createBody = z.object({
  classId: z.number(missingFields).int(missingFields).positive(missingFields),
  date: z.string(missingFields).min(1, missingFields),
  startTime: z.string(missingFields).min(1, missingFields),
  endTime: z.string(missingFields).min(1, missingFields),
  capacity: seatCount.nullish(),
  location: z.string(badLocation).nullish(),
  repeatWeekly: z.boolean(badRepeat).nullish(),
  numberOfWeeks: weekCount.nullish(),
});

export const POST = withAdmin({ body: createBody }, async ({ body }) => {
  const {
    classId,
    date,
    startTime,
    endTime,
    capacity,
    location,
    repeatWeekly,
    numberOfWeeks,
  } = body;

  if (repeatWeekly) {
    const weeks = numberOfWeeks || 1;
    const groupId = crypto.randomUUID();
    const recurringRule = `weekly:${groupId}`;

    const rows = Array.from({ length: weeks }, (_, i) => {
      const d = new Date(date);
      d.setDate(d.getDate() + i * 7);
      const isoDate = d.toISOString().split("T")[0];
      return {
        classId,
        date: isoDate,
        startTime,
        endTime,
        capacity: capacity || 8,
        location,
        recurringRule,
      };
    });

    const result = await db.insert(schedules).values(rows).returning();
    return NextResponse.json(result, { status: 201 });
  }

  const result = await db
    .insert(schedules)
    .values({
      classId,
      date,
      startTime,
      endTime,
      capacity: capacity || 8,
      location,
    })
    .returning();

  return NextResponse.json(result[0], { status: 201 });
});

/**
 * An update applies only the fields that are set, so anything the form leaves
 * empty means "leave it alone" rather than "refuse the edit" — the same reason
 * `seatCount` allows zero. The schema types the fields and no more.
 */
const updateBody = z.object({
  id: scheduleId,
  date: z.string({ error: "Date must be a date like 2026-06-09" }).nullish(),
  startTime: z
    .string({ error: "Start time must be a time like 09:00" })
    .nullish(),
  endTime: z.string({ error: "End time must be a time like 10:00" }).nullish(),
  capacity: seatCount.nullish(),
  location: z.string(badLocation).nullable().optional(),
  // From the one list of statuses, so a value cannot be accepted here that
  // nothing else knows about. There is no `full`: fullness is derived from
  // occupancy (`src/lib/schedules/availability.ts`), and `closed` is how she
  // stops a class taking bookings.
  status: z
    .enum(SCHEDULE_STATUSES, {
      error: "Status must be open, closed or cancelled",
    })
    .nullish(),
  classId: z
    .number({ error: "Class must be a whole number" })
    .int({ error: "Class must be a whole number" })
    .nonnegative({ error: "Class must be a whole number" })
    .nullish(),
  repeatWeekly: z.boolean(badRepeat).nullish(),
  numberOfWeeks: weekCount.nullish(),
});

export const PUT = withAdmin({ body: updateBody }, async ({ body }) => {
  const { id, location, repeatWeekly, numberOfWeeks } = body;

  const updateFields = {
    ...(body.date && { date: body.date }),
    ...(body.startTime && { startTime: body.startTime }),
    ...(body.endTime && { endTime: body.endTime }),
    ...(body.capacity && { capacity: body.capacity }),
    ...(location !== undefined && { location }),
    ...(body.status && { status: body.status }),
    ...(body.classId && { classId: body.classId }),
  };

  // Occupancy may not exceed capacity — the database refuses it. Caught here so
  // the answer names the bookings in the way, rather than being a 500 on the
  // schedule form: the seats have to be given back before the class shrinks.
  if (body.capacity) {
    const [existing] = await db
      .select({ bookedCount: schedules.bookedCount })
      .from(schedules)
      .where(eq(schedules.id, id));

    if (existing && body.capacity < existing.bookedCount) {
      throw new ApiError(
        400,
        `This class has ${existing.bookedCount} seats taken, so its capacity cannot go down to ${body.capacity}. Cancel or release a booking first.`,
      );
    }
  }

  // Cancelling takes the offers outstanding on the class with it: the same
  // transaction, so a class that is cancelled never keeps seats held for a class
  // that is not happening. Nothing is asked of Gabrielle first — she cancels at
  // short notice, and an extra gate would only be clicked through.
  //
  // Handled ahead of the recurrence branch so the void can never be skipped. A
  // request that cancelled a class and added weekly recurrence to it in one go
  // would be incoherent; cancelling is the unambiguous half, so it wins.
  if (updateFields.status === "cancelled") {
    const cancelled = await db.transaction(async (tx) => {
      const updated = await tx
        .update(schedules)
        .set(updateFields)
        .where(eq(schedules.id, id))
        .returning();

      if (updated.length === 0) return null;

      await voidOffersOnCancellation(tx, id);
      return updated[0];
    });

    if (!cancelled) {
      throw new ApiError(404, "Schedule not found");
    }

    return NextResponse.json(cancelled);
  }

  // If adding recurrence to an existing schedule, update the original
  // and create N-1 additional weekly rows
  if (repeatWeekly && numberOfWeeks && numberOfWeeks > 1) {
    const groupId = crypto.randomUUID();
    const recurringRule = `weekly:${groupId}`;

    // Update the existing schedule with new fields + recurringRule
    const updated = await db
      .update(schedules)
      .set({ ...updateFields, recurringRule })
      .where(eq(schedules.id, id))
      .returning();

    if (updated.length === 0) {
      throw new ApiError(404, "Schedule not found");
    }

    const base = updated[0];

    // Create additional weekly rows (weeks 2..N)
    const additionalRows = Array.from({ length: numberOfWeeks - 1 }, (_, i) => {
      const d = new Date(base.date);
      d.setDate(d.getDate() + (i + 1) * 7);
      return {
        classId: base.classId,
        date: d.toISOString().split("T")[0],
        startTime: base.startTime,
        endTime: base.endTime,
        capacity: base.capacity,
        location: base.location,
        recurringRule,
      };
    });

    const created = await db
      .insert(schedules)
      .values(additionalRows)
      .returning();

    return NextResponse.json([base, ...created]);
  }

  // Simple update (no recurrence change)
  const result = await db
    .update(schedules)
    .set(updateFields)
    .where(eq(schedules.id, id))
    .returning();

  if (result.length === 0) {
    throw new ApiError(404, "Schedule not found");
  }

  return NextResponse.json(result[0]);
});

const deleteBody = z.object({ id: scheduleId });

export const DELETE = withAdmin({ body: deleteBody }, async ({ body }) => {
  const { id } = body;

  // Deleting the class means deleting what is left pointing at it. Every one of
  // those rows is a foreign key with `ON DELETE no action`, so Postgres refuses
  // the parent delete while any of them exists — whatever their status says.
  // Doing it here rather than as `ON DELETE CASCADE` in the schema keeps the
  // destruction behind the guard below, which is the only place that has
  // decided it is safe; a cascade would apply to every future path that ever
  // deletes a schedule, silently.
  await db.transaction(async (tx) => {
    // Only a booking that still holds a place stands in the way. A class set up
    // by mistake, whose one booking was cancelled, has nobody attending it and
    // was otherwise undeletable forever. The statuses are filtered in JS rather
    // than in the WHERE clause so `holdsAPlace` stays the one definition of
    // which they are; a schedule has a handful of bookings, not a table scan.
    const existingBookings = await tx
      .select({ status: bookings.status })
      .from(bookings)
      .where(eq(bookings.scheduleId, id));

    // Thrown inside the transaction, so the refusal is also the rollback.
    if (existingBookings.some(holdsAPlace)) {
      throw new ApiError(
        409,
        "Cannot delete a schedule that people are still booked onto. Cancel the class instead.",
      );
    }

    // Anyone waiting goes with the class they were waiting for. First, because
    // an entry left behind by a voided offer still points at the held booking
    // about to be deleted below.
    await tx.delete(waitlistEntries).where(eq(waitlistEntries.scheduleId, id));

    // By the guard, every booking still on this schedule is cancelled or
    // released: nobody is coming, and the class they name is going. Stripe
    // remains the record of any money taken.
    await tx.delete(bookings).where(eq(bookings.scheduleId, id));

    // A booking moved *off* this class lives on another one and must not be
    // touched — it only remembers where it came from, and that class is gone.
    await tx
      .update(bookings)
      .set({ originalScheduleId: null })
      .where(eq(bookings.originalScheduleId, id));

    await tx.delete(schedules).where(eq(schedules.id, id));
  });

  return NextResponse.json({ deleted: true });
});

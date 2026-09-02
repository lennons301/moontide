import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { bookings, classes, schedules, waitlistEntries } from "@/lib/db/schema";
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

const positiveInt = z.number().int().positive();
const scheduleId = z.number(missingId).int(missingId).positive(missingId);

const createBody = z.object({
  classId: z.number(missingFields).int(missingFields).positive(missingFields),
  date: z.string(missingFields).min(1, missingFields),
  startTime: z.string(missingFields).min(1, missingFields),
  endTime: z.string(missingFields).min(1, missingFields),
  capacity: positiveInt.nullish(),
  location: z.string().nullish(),
  repeatWeekly: z.boolean().nullish(),
  numberOfWeeks: positiveInt.nullish(),
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

const updateBody = z.object({
  id: scheduleId,
  date: z.string().min(1).nullish(),
  startTime: z.string().min(1).nullish(),
  endTime: z.string().min(1).nullish(),
  capacity: positiveInt.nullish(),
  location: z.string().nullable().optional(),
  status: z.enum(["open", "full", "cancelled"]).nullish(),
  classId: positiveInt.nullish(),
  repeatWeekly: z.boolean().nullish(),
  numberOfWeeks: positiveInt.nullish(),
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

  const existingBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.scheduleId, id))
    .limit(1);

  if (existingBookings.length > 0) {
    throw new ApiError(
      409,
      "Cannot delete a schedule that has bookings. Cancel the class instead.",
    );
  }

  await db.delete(schedules).where(eq(schedules.id, id));
  return NextResponse.json({ deleted: true });
});

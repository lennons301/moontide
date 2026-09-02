import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, classes, schedules, waitlistEntries } from "@/lib/db/schema";
import { voidOffersOnCancellation } from "@/lib/waitlist/cancellation";

export async function GET() {
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
}

export async function POST(request: Request) {
  const body = await request.json();
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

  if (!classId || !date || !startTime || !endTime) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

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
}

export async function PUT(request: Request) {
  const body = await request.json();
  const {
    id,
    date,
    startTime,
    endTime,
    capacity,
    location,
    status,
    classId,
    repeatWeekly,
    numberOfWeeks,
  } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing schedule ID" }, { status: 400 });
  }

  const updateFields = {
    ...(date && { date }),
    ...(startTime && { startTime }),
    ...(endTime && { endTime }),
    ...(capacity && { capacity }),
    ...(location !== undefined && { location }),
    ...(status && { status }),
    ...(classId && { classId }),
  };

  // Occupancy may not exceed capacity — the database refuses it. Caught here so
  // the answer names the bookings in the way, rather than being a 500 on the
  // schedule form: the seats have to be given back before the class shrinks.
  if (capacity) {
    const [existing] = await db
      .select({ bookedCount: schedules.bookedCount })
      .from(schedules)
      .where(eq(schedules.id, id));

    if (existing && capacity < existing.bookedCount) {
      return NextResponse.json(
        {
          error: `This class has ${existing.bookedCount} seats taken, so its capacity cannot go down to ${capacity}. Cancel or release a booking first.`,
        },
        { status: 400 },
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
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(cancelled);
  }

  // If adding recurrence to an existing schedule, update the original
  // and create N-1 additional weekly rows
  if (repeatWeekly && numberOfWeeks > 1) {
    const groupId = crypto.randomUUID();
    const recurringRule = `weekly:${groupId}`;

    // Update the existing schedule with new fields + recurringRule
    const updated = await db
      .update(schedules)
      .set({ ...updateFields, recurringRule })
      .where(eq(schedules.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json(
        { error: "Schedule not found" },
        { status: 404 },
      );
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
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  return NextResponse.json(result[0]);
}

export async function DELETE(request: Request) {
  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing schedule ID" }, { status: 400 });
  }

  const existingBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.scheduleId, id))
    .limit(1);

  if (existingBookings.length > 0) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a schedule that has bookings. Cancel the class instead.",
      },
      { status: 409 },
    );
  }

  await db.delete(schedules).where(eq(schedules.id, id));
  return NextResponse.json({ deleted: true });
}

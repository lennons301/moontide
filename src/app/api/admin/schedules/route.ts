import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classes, schedules } from "@/lib/db/schema";

export async function GET() {
  const result = await db
    .select()
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .orderBy(desc(schedules.date));
  return NextResponse.json(result);
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
  await db.delete(schedules).where(eq(schedules.id, id));
  return NextResponse.json({ deleted: true });
}

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
  const { classId, date, startTime, endTime, capacity, location } = body;

  if (!classId || !date || !startTime || !endTime) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
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

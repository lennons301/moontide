import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, classes, schedules } from "@/lib/db/schema";

export async function GET() {
  const result = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .orderBy(desc(bookings.createdAt));
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const { id, status } = await request.json();

  if (!id || !status) {
    return NextResponse.json(
      { error: "Missing id or status" },
      { status: 400 },
    );
  }

  if (status === "cancelled") {
    const existing = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));

    if (existing.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (existing[0].status === "cancelled") {
      return NextResponse.json(
        { error: "Booking is already cancelled" },
        { status: 400 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status: "cancelled" })
        .where(eq(bookings.id, id));
      await tx
        .update(schedules)
        .set({ bookedCount: sql`GREATEST(${schedules.bookedCount} - 1, 0)` })
        .where(eq(schedules.id, existing[0].scheduleId));
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid status" }, { status: 400 });
}

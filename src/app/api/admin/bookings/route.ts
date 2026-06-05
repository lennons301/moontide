import { desc, eq, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, classes, schedules } from "@/lib/db/schema";
import { sendRescheduleNotification } from "@/lib/email";

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
  const body = await request.json();
  const { id, status, newScheduleId } = body as {
    id?: number;
    status?: string;
    newScheduleId?: number;
  };

  if (!id || (!status && !newScheduleId)) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // Cancel branch (existing behaviour)
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

  // Reschedule branch
  if (newScheduleId) {
    const bookingRows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));
    if (bookingRows.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingRows[0];

    if (booking.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot reschedule a cancelled booking" },
        { status: 400 },
      );
    }

    const sourceRows = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, booking.scheduleId));
    const source = sourceRows[0];

    const targetRows = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, newScheduleId));
    if (targetRows.length === 0) {
      return NextResponse.json(
        { error: "Target schedule not found" },
        { status: 404 },
      );
    }
    const target = targetRows[0];

    if (target.classId !== source.classId) {
      return NextResponse.json(
        { error: "Cannot reschedule to a different class" },
        { status: 400 },
      );
    }

    if (target.status === "cancelled") {
      return NextResponse.json(
        { error: "Target class is cancelled" },
        { status: 400 },
      );
    }

    if (newScheduleId === booking.scheduleId) {
      return NextResponse.json(
        { error: "Booking is already on that schedule" },
        { status: 400 },
      );
    }

    if (target.bookedCount >= target.capacity) {
      return NextResponse.json(
        { error: "Target class is full" },
        { status: 400 },
      );
    }

    const classRows = await db
      .select()
      .from(classes)
      .where(eq(classes.id, source.classId));
    const classInfo = classRows[0];

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({
          scheduleId: newScheduleId,
          rescheduledAt: new Date(),
          originalScheduleId: booking.originalScheduleId ?? booking.scheduleId,
        })
        .where(eq(bookings.id, id));
      await tx
        .update(schedules)
        .set({ bookedCount: sql`GREATEST(${schedules.bookedCount} - 1, 0)` })
        .where(eq(schedules.id, source.id));
      await tx
        .update(schedules)
        .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
        .where(eq(schedules.id, target.id));
    });

    after(async () => {
      try {
        await sendRescheduleNotification({
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          classTitle: classInfo.title,
          oldDate: source.date,
          oldStartTime: source.startTime,
          oldEndTime: source.endTime,
          newDate: target.date,
          newStartTime: target.startTime,
          newEndTime: target.endTime,
          newLocation: target.location,
        });
      } catch (e) {
        console.error("Reschedule email send failed", e);
      }
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid status" }, { status: 400 });
}

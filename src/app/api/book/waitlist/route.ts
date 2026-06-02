import { eq, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classes, schedules, waitlistEntries } from "@/lib/db/schema";
import {
  sendWaitlistConfirmation,
  sendWaitlistNotification,
} from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
  const { scheduleId, customerName, customerEmail } = body as {
    scheduleId?: number;
    customerName?: string;
    customerEmail?: string;
  };

  if (!scheduleId || !customerName?.trim() || !customerEmail?.trim()) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const result = await db
    .select()
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(eq(schedules.id, scheduleId));

  if (result.length === 0) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const schedule = result[0].schedules;
  const classInfo = result[0].classes;

  if (schedule.status === "cancelled") {
    return NextResponse.json(
      { error: "Class is not available" },
      { status: 400 },
    );
  }

  const isFull =
    schedule.status === "full" || schedule.bookedCount >= schedule.capacity;

  if (!isFull) {
    return NextResponse.json(
      { error: "Class still has spots — please book normally" },
      { status: 400 },
    );
  }

  let isNewSignup = true;
  let insertedId: number | null = null;
  try {
    const inserted = await db
      .insert(waitlistEntries)
      .values({
        scheduleId,
        customerName,
        customerEmail,
      })
      .returning({ id: waitlistEntries.id });
    insertedId = inserted[0]?.id ?? null;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "23505") {
      isNewSignup = false;
    } else {
      throw err;
    }
  }

  if (isNewSignup) {
    after(async () => {
      try {
        const countRows = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(waitlistEntries)
          .where(eq(waitlistEntries.scheduleId, scheduleId));
        const waitlistCount = countRows[0]?.count ?? 0;

        await sendWaitlistConfirmation({
          customerName,
          customerEmail,
          classTitle: classInfo.title,
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          location: schedule.location,
        });
        await sendWaitlistNotification({
          customerName,
          customerEmail,
          classTitle: classInfo.title,
          date: schedule.date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          waitlistCount,
        });
        if (insertedId !== null) {
          await db
            .update(waitlistEntries)
            .set({ emailSent: true })
            .where(eq(waitlistEntries.id, insertedId));
        }
      } catch (e) {
        console.error("Waitlist email send failed", e);
      }
    });
  }

  return NextResponse.json({ ok: true });
}

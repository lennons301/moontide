import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { normaliseEmail } from "@/lib/customers/email";
import { db } from "@/lib/db";
import { classes, schedules, waitlistEntries } from "@/lib/db/schema";
import { notifyAfterResponse } from "@/lib/notifications";

export async function POST(request: Request) {
  const body = await request.json();
  const { scheduleId, customerName, customerEmail } = body as {
    scheduleId?: number;
    customerName?: string;
    customerEmail?: string;
  };

  const normalisedName = customerName?.trim() ?? "";
  const normalisedEmail = normaliseEmail(customerEmail);

  if (!scheduleId || !normalisedName || !normalisedEmail) {
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
        customerName: normalisedName,
        customerEmail: normalisedEmail,
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
    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waitlistEntries)
      .where(eq(waitlistEntries.scheduleId, scheduleId));

    // The entry keeps its unsent flag if this does not get through, and now
    // carries the reason. That flag used to be written once and read by
    // nothing, so a waiting-list confirmation that failed was lost with nobody
    // able to see it; the daily sweep retries these.
    notifyAfterResponse(
      {
        type: "waitlist-joined",
        customerName: normalisedName,
        customerEmail: normalisedEmail,
        classTitle: classInfo.title,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        location: schedule.location,
        waitlistCount: countRows[0]?.count ?? 0,
      },
      insertedId === null
        ? { notRecorded: "the insert returned no id to record against" }
        : { on: waitlistEntries, row: insertedId },
    );
  }

  return NextResponse.json({ ok: true });
}

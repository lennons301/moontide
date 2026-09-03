import { desc, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  checkReschedulable,
  decideCancel,
  decideRelease,
  decideReschedule,
} from "@/lib/bookings/transitions";
import { refundCredit } from "@/lib/bundles/credits";
import { db } from "@/lib/db";
import { bookings, classes, schedules } from "@/lib/db/schema";
import { sendRescheduleNotification } from "@/lib/email";
import { markEmailFailed, markEmailSent } from "@/lib/notifications/delivery";
import { claimSeat, releaseSeat } from "@/lib/schedule-occupancy";
import { londonDateString } from "@/lib/time/london";
import { ApiError, refuse, withAdmin } from "../_lib";

export const GET = withAdmin({}, async () => {
  const result = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .orderBy(desc(bookings.createdAt));
  return NextResponse.json(result);
});

async function findBooking(id: number) {
  const rows = await db.select().from(bookings).where(eq(bookings.id, id));
  return rows[0] ?? null;
}

async function findSchedule(id: number) {
  const rows = await db.select().from(schedules).where(eq(schedules.id, id));
  return rows[0] ?? null;
}

const missing = { error: "Missing required fields" };
const badTarget = { error: "Choose a class to move the booking to" };

const transitionBody = z
  .object({
    id: z.number(missing).int(missing).positive(missing),
    // Left as a string, not an enum: the branches below name the two statuses
    // they handle and answer "Invalid status" for anything else, so the schema
    // and the handler say the same thing.
    status: z.string({ error: "Invalid status" }).optional(),
    newScheduleId: z
      .number(badTarget)
      .int(badTarget)
      .positive(badTarget)
      .optional(),
  })
  // One of the two says what to do with the booking; without either there is
  // no transition to make.
  .refine(
    (b) => b.status !== undefined || b.newScheduleId !== undefined,
    missing,
  );

export const PUT = withAdmin({ body: transitionBody }, async ({ body }) => {
  const { id, status, newScheduleId } = body;

  // Cancel branch
  if (status === "cancelled") {
    const decision = decideCancel(await findBooking(id));
    if (!decision.ok) refuse(decision);

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status: decision.nextStatus })
        .where(eq(bookings.id, id));
      if (decision.decrementSchedule) {
        await releaseSeat(tx, decision.booking.scheduleId);
      }
      if (decision.restoreCreditToBundleId) {
        await refundCredit(tx, decision.restoreCreditToBundleId);
      }
    });

    return NextResponse.json({ success: true });
  }

  // Release branch — hand the seat back without settling what the customer is
  // owed. A bundle credit goes straight back and the booking is cancelled; a
  // card booking becomes `released`, leaving the customer owed a class until
  // Gabrielle reschedules them.
  if (status === "released") {
    const decision = decideRelease(await findBooking(id));
    if (!decision.ok) refuse(decision);

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status: decision.nextStatus, releasedAt: new Date() })
        .where(eq(bookings.id, id));
      await releaseSeat(tx, decision.booking.scheduleId);
      if (decision.restoreCreditToBundleId) {
        await refundCredit(tx, decision.restoreCreditToBundleId);
      }
    });

    return NextResponse.json({ success: true, effect: decision.effect });
  }

  // Reschedule branch
  if (newScheduleId) {
    const reschedulable = checkReschedulable(await findBooking(id));
    if (!reschedulable.ok) refuse(reschedulable);
    const { booking } = reschedulable;

    const decision = decideReschedule({
      booking,
      source: await findSchedule(booking.scheduleId),
      target: await findSchedule(newScheduleId),
      newScheduleId,
      // Gabrielle's today, not the runtime's: a schedule's date is a London
      // wall-clock date, and Vercel runs in UTC.
      today: londonDateString(new Date()),
    });
    if (!decision.ok) refuse(decision);
    const { source, target } = decision;

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
          originalScheduleId: decision.originalScheduleId,
          // Moving a released booking onto a new date settles what was owed.
          status: decision.nextStatus,
          releasedAt: null,
          // The customer is owed a word about the move, and until it goes out
          // this row sits in the retry sweep — the note used to be sent in an
          // `after` with a try/catch and no flag at all, so a failed one was
          // lost. It supersedes an unsent confirmation deliberately: the note
          // names the class, the old date and the new one, so it stands on its
          // own for someone who never received the first email either.
          emailSent: false,
          emailKind: "reschedule",
          emailLastError: null,
        })
        .where(eq(bookings.id, id));
      // A released booking already handed its seat back, so only the target
      // schedule moves.
      if (decision.decrementSource) {
        await releaseSeat(tx, source.id);
      }
      const claim = await claimSeat(tx, target.id);
      if (!claim.claimed) {
        // Lost a race for the last place since the check above. The throw is
        // both the refusal and the rollback.
        throw new ApiError(400, "Target class is full");
      }
    });

    after(async () => {
      try {
        await sendRescheduleNotification({
          customerName: decision.booking.customerName,
          customerEmail: decision.booking.customerEmail,
          classTitle: classInfo.title,
          oldDate: source.date,
          oldStartTime: source.startTime,
          oldEndTime: source.endTime,
          newDate: target.date,
          newStartTime: target.startTime,
          newEndTime: target.endTime,
          newLocation: target.location,
        });
        await markEmailSent(bookings, id);
      } catch (e) {
        console.error("Reschedule email send failed", e);
        await markEmailFailed(bookings, id, e);
      }
    });

    return NextResponse.json({ success: true });
  }

  throw new ApiError(400, "Invalid status");
});

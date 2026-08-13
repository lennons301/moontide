import { desc, eq, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import {
  checkReschedulable,
  decideCancel,
  decideRelease,
  decideReschedule,
} from "@/lib/bookings/transitions";
import { db } from "@/lib/db";
import { bookings, bundles, classes, schedules } from "@/lib/db/schema";
import { sendRescheduleNotification } from "@/lib/email";
import { claimSeat, releaseSeat } from "@/lib/schedule-occupancy";

/** Signals that the atomic claim on the target schedule was refused. */
class TargetFullError extends Error {}

export async function GET() {
  const result = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .orderBy(desc(bookings.createdAt));
  return NextResponse.json(result);
}

async function findBooking(id: number) {
  const rows = await db.select().from(bookings).where(eq(bookings.id, id));
  return rows[0] ?? null;
}

async function findSchedule(id: number) {
  const rows = await db.select().from(schedules).where(eq(schedules.id, id));
  return rows[0] ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Give the credit back (capped at the bundle total) and re-activate a bundle
// that had been fully spent.
function restoreBundleCredit(tx: Tx, bundleId: number) {
  return tx
    .update(bundles)
    .set({
      creditsRemaining: sql`LEAST(${bundles.creditsRemaining} + 1, ${bundles.creditsTotal})`,
      status: sql`CASE WHEN ${bundles.status} = 'exhausted' THEN 'active'::bundle_status ELSE ${bundles.status} END`,
    })
    .where(eq(bundles.id, bundleId));
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

  // Cancel branch
  if (status === "cancelled") {
    const decision = decideCancel(await findBooking(id));
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error },
        { status: decision.httpStatus },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status: decision.nextStatus })
        .where(eq(bookings.id, id));
      if (decision.decrementSchedule) {
        await releaseSeat(tx, decision.booking.scheduleId);
      }
      if (decision.restoreCreditToBundleId) {
        await restoreBundleCredit(tx, decision.restoreCreditToBundleId);
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
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error },
        { status: decision.httpStatus },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status: decision.nextStatus, releasedAt: new Date() })
        .where(eq(bookings.id, id));
      await releaseSeat(tx, decision.booking.scheduleId);
      if (decision.restoreCreditToBundleId) {
        await restoreBundleCredit(tx, decision.restoreCreditToBundleId);
      }
    });

    return NextResponse.json({ success: true, effect: decision.effect });
  }

  // Reschedule branch
  if (newScheduleId) {
    const reschedulable = checkReschedulable(await findBooking(id));
    if (!reschedulable.ok) {
      return NextResponse.json(
        { error: reschedulable.error },
        { status: reschedulable.httpStatus },
      );
    }
    const { booking } = reschedulable;

    const decision = decideReschedule({
      booking,
      source: await findSchedule(booking.scheduleId),
      target: await findSchedule(newScheduleId),
      newScheduleId,
    });
    if (!decision.ok) {
      return NextResponse.json(
        { error: decision.error },
        { status: decision.httpStatus },
      );
    }
    const { source, target } = decision;

    const classRows = await db
      .select()
      .from(classes)
      .where(eq(classes.id, source.classId));
    const classInfo = classRows[0];

    try {
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
          })
          .where(eq(bookings.id, id));
        // A released booking already handed its seat back, so only the target
        // schedule moves.
        if (decision.decrementSource) {
          await releaseSeat(tx, source.id);
        }
        const claim = await claimSeat(tx, target.id);
        if (!claim.claimed) {
          // Lost a race for the last place since the check above; roll back.
          throw new TargetFullError();
        }
      });
    } catch (error) {
      if (error instanceof TargetFullError) {
        return NextResponse.json(
          { error: "Target class is full" },
          { status: 400 },
        );
      }
      throw error;
    }

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
      } catch (e) {
        console.error("Reschedule email send failed", e);
      }
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid status" }, { status: 400 });
}

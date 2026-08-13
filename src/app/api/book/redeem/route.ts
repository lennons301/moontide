import { and, eq, gt, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, bundles, classes, schedules } from "@/lib/db/schema";
import { claimSeat } from "@/lib/schedule-occupancy";

export async function POST(request: Request) {
  const { scheduleId, customerName, customerEmail } = await request.json();

  if (!scheduleId || !customerName || !customerEmail) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const scheduleRows = await db
    .select({
      status: schedules.status,
      bundleEligible: classes.bundleEligible,
    })
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(eq(schedules.id, scheduleId));

  if (scheduleRows.length === 0) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const schedule = scheduleRows[0];

  // Bundle credits may only be spent on classes flagged as bundle-eligible.
  if (!schedule.bundleEligible) {
    return NextResponse.json(
      { error: "This class cannot be booked with a bundle" },
      { status: 400 },
    );
  }

  // A cancelled class takes no bookings by either payment path. Wording matches
  // the card path so the customer sees one message however they were booking.
  if (schedule.status === "cancelled") {
    return NextResponse.json(
      { error: "Class is not available" },
      { status: 400 },
    );
  }

  const activeBundles = await db
    .select()
    .from(bundles)
    .where(
      and(
        eq(bundles.customerEmail, customerEmail),
        eq(bundles.status, "active"),
        gt(bundles.creditsRemaining, 0),
        gt(bundles.expiresAt, new Date()),
      ),
    );

  if (activeBundles.length === 0) {
    return NextResponse.json(
      { error: "No active bundle found" },
      { status: 404 },
    );
  }

  const bundle = activeBundles[0];

  // Prevent double-booking the same class with bundle credits.
  const existingBooking = await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.scheduleId, scheduleId),
        eq(bookings.customerEmail, customerEmail),
        ne(bookings.status, "cancelled"),
      ),
    );

  if (existingBooking.length > 0) {
    return NextResponse.json(
      { error: "You already have a booking for this class" },
      { status: 409 },
    );
  }

  const newCredits = bundle.creditsRemaining - 1;

  const redeemed = await db.transaction(async (tx) => {
    // Capacity is enforced by the claim, not by a read taken beforehand: the
    // guard is the UPDATE's own WHERE clause, so two redemptions racing for one
    // remaining place cannot both win. Nothing has been written when the claim
    // is refused, so returning early leaves the booking, the credit and the
    // occupancy count untouched — the credit is still the customer's to spend.
    const claim = await claimSeat(tx, scheduleId);

    if (!claim.claimed) {
      return false;
    }

    await tx.insert(bookings).values({
      scheduleId,
      customerName,
      customerEmail,
      bundleId: bundle.id,
    });

    await tx
      .update(bundles)
      .set({
        creditsRemaining: newCredits,
        status: newCredits === 0 ? "exhausted" : "active",
      })
      .where(eq(bundles.id, bundle.id));

    return true;
  });

  if (!redeemed) {
    return NextResponse.json({ error: "Class is full" }, { status: 400 });
  }

  return NextResponse.json({ success: true, creditsRemaining: newCredits });
}

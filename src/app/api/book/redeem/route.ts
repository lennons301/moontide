import { and, eq, gt, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, bundles, schedules } from "@/lib/db/schema";

export async function POST(request: Request) {
  const { scheduleId, customerName, customerEmail } = await request.json();

  if (!scheduleId || !customerName || !customerEmail) {
    return NextResponse.json(
      { error: "Missing required fields" },
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

  await db.transaction(async (tx) => {
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

    await tx
      .update(schedules)
      .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
      .where(eq(schedules.id, scheduleId));
  });

  return NextResponse.json({ success: true, creditsRemaining: newCredits });
}

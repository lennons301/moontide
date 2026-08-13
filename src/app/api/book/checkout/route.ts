import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, bundleConfig, classes, schedules } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";
import { findOfferByToken } from "@/lib/waitlist/held-seats";
import { decideCheckoutSeat } from "@/lib/waitlist/offers";

export async function POST(request: Request) {
  const stripe = getStripe();
  const body = await request.json();
  const {
    type,
    scheduleId,
    customerName,
    customerEmail,
    bundleConfigId,
    offerToken,
  } = body;

  if (!customerEmail) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (type === "bundle") {
    const configs = await db
      .select()
      .from(bundleConfig)
      .where(
        and(eq(bundleConfig.id, bundleConfigId), eq(bundleConfig.active, true)),
      );

    if (configs.length === 0) {
      return NextResponse.json(
        { error: "Bundle configuration not found" },
        { status: 400 },
      );
    }

    const config = configs[0];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: config.name,
              description: `${config.credits} classes, valid for ${config.expiryDays} days from purchase`,
            },
            unit_amount: config.priceInPence,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "bundle",
        bundleConfigId: String(config.id),
        customerEmail,
      },
      customer_email: customerEmail,
      success_url: `${process.env.BETTER_AUTH_URL}/book/confirmation?session_id={CHECKOUT_SESSION_ID}&type=bundle`,
      cancel_url: `${process.env.BETTER_AUTH_URL}/book/bundle`,
    });

    return NextResponse.json({ url: session.url });
  }

  // Individual class booking
  if (!scheduleId || !customerName) {
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

  // Bookings already held by this customer for this class — used both to keep
  // them from paying twice and, when they hold an offer, to recognise their own
  // held seat rather than reading it as a duplicate.
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

  // A recipient paying by card is refused twice over by the ordinary checks —
  // already booked, and class full — because their own held seat is what both
  // are reading. A valid token bypasses those, and nothing more.
  const seat = decideCheckoutSeat({
    token: offerToken,
    offer: offerToken ? await findOfferByToken(offerToken) : null,
    request: { scheduleId, customerEmail },
    existingBookings: existingBooking,
    schedule: {
      status: schedule.status,
      capacity: schedule.capacity,
      bookedCount: schedule.bookedCount,
    },
    now: new Date(),
  });

  if (!seat.ok) {
    return NextResponse.json(
      { error: seat.error },
      { status: seat.httpStatus },
    );
  }

  // The offer travels with the payment: the webhook converts the seat it names
  // rather than reading it as a duplicate booking and keeping the money.
  const offerMetadata: Record<string, string> =
    seat.kind === "held-seat"
      ? {
          offerToken: String(offerToken),
          heldBookingId: String(seat.bookingId),
        }
      : {};

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: {
            name: classInfo.title,
            description: `${schedule.date} ${schedule.startTime}–${schedule.endTime}`,
          },
          unit_amount: classInfo.priceInPence,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "individual",
      scheduleId: String(scheduleId),
      customerName,
      customerEmail,
      ...offerMetadata,
    },
    customer_email: customerEmail,
    success_url: `${process.env.BETTER_AUTH_URL}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:
      seat.kind === "held-seat"
        ? `${process.env.BETTER_AUTH_URL}/book/offer/${offerToken}`
        : `${process.env.BETTER_AUTH_URL}/book`,
  });

  return NextResponse.json({ url: session.url });
}

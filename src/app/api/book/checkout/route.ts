import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classes, schedules } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const { scheduleId, customerName, customerEmail } = await request.json();

  if (!scheduleId || !customerName || !customerEmail) {
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

  if (schedule.status !== "open") {
    return NextResponse.json(
      { error: "Class is not available" },
      { status: 400 },
    );
  }

  if (schedule.bookedCount >= schedule.capacity) {
    return NextResponse.json({ error: "Class is full" }, { status: 400 });
  }

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
    },
    customer_email: customerEmail,
    success_url: `${process.env.BETTER_AUTH_URL}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BETTER_AUTH_URL}/book`,
  });

  return NextResponse.json({ url: session.url });
}

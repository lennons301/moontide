import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, bundles, schedules } from "@/lib/db/schema";
import { stripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature")!;

  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata;

    if (metadata?.type === "individual") {
      // Individual class booking
      const scheduleId = Number.parseInt(metadata.scheduleId, 10);
      await db.insert(bookings).values({
        scheduleId,
        customerName: metadata.customerName,
        customerEmail: metadata.customerEmail,
        stripePaymentId: session.id,
      });
      await db
        .update(schedules)
        .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
        .where(eq(schedules.id, scheduleId));
    } else if (metadata?.type === "bundle") {
      // Bundle purchase
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);
      await db.insert(bundles).values({
        customerEmail: metadata.customerEmail,
        stripePaymentId: session.id,
        expiresAt,
      });
    }
  }

  return NextResponse.json({ received: true });
}

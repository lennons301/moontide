import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, bundleConfig, bundles, schedules } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
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
      const scheduleId = Number.parseInt(metadata.scheduleId, 10);
      await db.transaction(async (tx) => {
        await tx.insert(bookings).values({
          scheduleId,
          customerName: metadata.customerName,
          customerEmail: metadata.customerEmail,
          stripePaymentId: session.id,
        });
        await tx
          .update(schedules)
          .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
          .where(eq(schedules.id, scheduleId));
      });
    } else if (metadata?.type === "bundle") {
      const configId = Number.parseInt(metadata.bundleConfigId, 10);
      const configs = await db
        .select()
        .from(bundleConfig)
        .where(eq(bundleConfig.id, configId));

      const config = configs[0];
      if (!config) {
        console.error(
          `Bundle config not found for id: ${configId}, session: ${session.id}`,
        );
        return NextResponse.json(
          { error: "Bundle config not found" },
          { status: 500 },
        );
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + config.expiryDays);

      await db.insert(bundles).values({
        customerEmail: metadata.customerEmail,
        creditsTotal: config.credits,
        creditsRemaining: config.credits,
        stripePaymentId: session.id,
        expiresAt,
      });
    }
  }

  return NextResponse.json({ received: true });
}

import { eq, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  bookings,
  bundleConfig,
  bundles,
  classes,
  schedules,
} from "@/lib/db/schema";
import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendBundleConfirmation,
} from "@/lib/email";
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

      after(async () => {
        try {
          const result = await db
            .select()
            .from(schedules)
            .innerJoin(classes, eq(schedules.classId, classes.id))
            .where(eq(schedules.id, scheduleId));

          if (result.length > 0) {
            const schedule = result[0].schedules;
            const classInfo = result[0].classes;

            await sendBookingConfirmation({
              customerName: metadata.customerName,
              customerEmail: metadata.customerEmail,
              classTitle: classInfo.title,
              date: schedule.date,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              location: schedule.location,
              priceInPence: classInfo.priceInPence,
            });

            await sendBookingNotification({
              type: "individual",
              customerName: metadata.customerName,
              customerEmail: metadata.customerEmail,
              classTitle: classInfo.title,
              date: schedule.date,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              location: schedule.location,
            });

            await db
              .update(bookings)
              .set({ emailSent: true })
              .where(eq(bookings.stripePaymentId, session.id));
          }
        } catch (error) {
          console.error("Failed to send booking confirmation email:", error);
        }
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

      const expiryDateFormatted = expiresAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      after(async () => {
        try {
          await sendBundleConfirmation({
            customerEmail: metadata.customerEmail,
            bundleName: config.name,
            credits: config.credits,
            expiryDate: expiryDateFormatted,
          });

          await sendBookingNotification({
            type: "bundle",
            customerEmail: metadata.customerEmail,
            bundleName: config.name,
            credits: config.credits,
            expiryDate: expiryDateFormatted,
          });

          await db
            .update(bundles)
            .set({ emailSent: true })
            .where(eq(bundles.stripePaymentId, session.id));
        } catch (error) {
          console.error("Failed to send bundle confirmation email:", error);
        }
      });
    }
  }

  return NextResponse.json({ received: true });
}

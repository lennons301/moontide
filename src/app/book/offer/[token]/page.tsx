import { and, eq, gt } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { bundles, classes, schedules } from "@/lib/db/schema";
import { findOfferByToken } from "@/lib/waitlist/held-seats";
import { OfferClient } from "./offer-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your place — Moontide" };

function formatDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDeadline(deadline: Date) {
  return deadline.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-lg mx-auto">{children}</div>
    </section>
  );
}

/** Plain wording, not an error: an offer runs out or gets taken up. */
function OfferClosed({ message }: { message: string }) {
  return (
    <Shell>
      <div className="text-center">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue mb-3">
          This place isn't available
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-6" />
        <p className="text-deep-ocean leading-relaxed mb-8">{message}</p>
        <Link
          href="/book"
          className="inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
        >
          Browse Classes
        </Link>
      </div>
    </Shell>
  );
}

export default async function OfferPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const offer = await findOfferByToken(token);

  if (!offer) {
    return (
      <OfferClosed message="This link is no longer valid — the place may already have been taken up. If you think it should still be yours, get in touch with Gabrielle." />
    );
  }
  if (offer.heldBookingStatus !== "held") {
    return (
      <OfferClosed message="This place has already been taken up. If that wasn't you, get in touch with Gabrielle." />
    );
  }
  if (!offer.offerExpiresAt || offer.offerExpiresAt.getTime() <= Date.now()) {
    return (
      <OfferClosed message="This offer has passed its deadline, so the place has gone back to the class. You're still on the waiting list — get in touch with Gabrielle if you'd like to talk it through." />
    );
  }

  const scheduleRows = await db
    .select()
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(eq(schedules.id, offer.scheduleId));
  const schedule = scheduleRows[0]?.schedules;
  const classInfo = scheduleRows[0]?.classes;

  if (!schedule || !classInfo) {
    return (
      <OfferClosed message="We couldn't find that class. Get in touch with Gabrielle and she'll sort it out." />
    );
  }

  // Whether they hold credits is decided from their email address alone — the
  // same posture bundle redemption already takes, with no customer login.
  const usableBundles = await db
    .select({ creditsRemaining: bundles.creditsRemaining })
    .from(bundles)
    .where(
      and(
        eq(bundles.customerEmail, offer.customerEmail),
        eq(bundles.status, "active"),
        gt(bundles.creditsRemaining, 0),
        gt(bundles.expiresAt, new Date()),
      ),
    );

  return (
    <Shell>
      <OfferClient
        scheduleId={schedule.id}
        token={token}
        customerName={offer.customerName}
        customerEmail={offer.customerEmail}
        classTitle={classInfo.title}
        date={formatDate(schedule.date)}
        time={`${schedule.startTime.slice(0, 5)}–${schedule.endTime.slice(0, 5)}`}
        location={schedule.location}
        deadline={formatDeadline(offer.offerExpiresAt)}
        creditsAvailable={usableBundles[0]?.creditsRemaining ?? 0}
        bundleEligible={classInfo.bundleEligible}
        priceInPence={classInfo.priceInPence}
      />
    </Shell>
  );
}

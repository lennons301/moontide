import { NextResponse } from "next/server";
import { retryPendingEmails } from "@/lib/notifications/retry";
import { runDailyOfferWork } from "@/lib/waitlist/daily";

/**
 * The daily job. Email retries came first and name the route; the offer work
 * (settling offers nobody answered, and Gabrielle's digest) is folded in behind
 * them because this plan permits only daily schedules and we could not confirm
 * how many entries it permits. Both are safe to run late — see
 * `runDailyOfferWork` and `retryPendingEmails`, neither of which is bounded by
 * when it happens to run.
 *
 * Wiring only: what gets retried, and what is deliberately left, is decided in
 * `src/lib/notifications/retry.ts`.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const retries = await retryPendingEmails(now);

  // Runs after the retries so a failure in the newer work cannot cost a customer
  // their confirmation email.
  const offerWork = await runDailyOfferWork(now);

  const total = (key: "sent" | "failed" | "skipped") =>
    retries.bookingConfirmations[key] +
    retries.reschedules[key] +
    retries.bundleConfirmations[key] +
    retries.waitlistConfirmations[key];

  return NextResponse.json({
    retries,
    succeeded: total("sent"),
    failed: total("failed"),
    skipped: total("skipped"),
    expiredOffers: offerWork.expiredOffers,
    digest: offerWork.digest,
  });
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Booking Confirmed — Moontide" };

export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const isBundle = type === "bundle";
  const isWaitlist = type === "waitlist";

  let title: string;
  let message: string;
  let primaryLabel: string;
  if (isWaitlist) {
    title = "You're on the waiting list";
    message =
      "We'll be in touch by email if a spot opens up. In the meantime, you can browse other upcoming classes.";
    primaryLabel = "Browse Classes";
  } else if (isBundle) {
    title = "Bundle Purchased!";
    message =
      "Your six class bundle is ready to use. You'll receive a confirmation email shortly with your bundle details.";
    primaryLabel = "Book a Class";
  } else {
    title = "Booking Confirmed!";
    message =
      "Your class is booked. You'll receive a confirmation email shortly with all the details.";
    primaryLabel = "Book Another";
  }

  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-lg mx-auto text-center">
        <div className="w-16 h-16 rounded-full bg-seagrass/20 flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-seagrass"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            role="img"
            aria-label="Success checkmark"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue mb-3">
          {title}
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-6" />

        <p className="text-deep-ocean leading-relaxed mb-8">{message}</p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/book"
            className="inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
          >
            {primaryLabel}
          </Link>
          <Link
            href="/"
            className="inline-block border border-soft-moonstone text-deep-tide-blue px-6 py-3 rounded-md font-semibold hover:bg-soft-moonstone/30 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}

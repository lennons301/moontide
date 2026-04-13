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

  return (
    <section className="py-16 px-6 bg-foam-white">
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

        <h1 className="text-3xl md:text-4xl font-semibold text-deep-current mb-3">
          {isBundle ? "Bundle Purchased!" : "Booking Confirmed!"}
        </h1>
        <div className="w-8 h-0.5 bg-lunar-gold mx-auto mb-6" />

        <p className="text-deep-ocean leading-relaxed mb-8">
          {isBundle
            ? "Your six class bundle is ready to use. You'll receive a confirmation email shortly with your bundle details."
            : "Your class is booked. You'll receive a confirmation email shortly with all the details."}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/book"
            className="inline-block bg-lunar-gold text-foam-white px-6 py-3 rounded-md font-semibold hover:bg-lunar-gold/90 transition-colors"
          >
            {isBundle ? "Book a Class" : "Book Another"}
          </Link>
          <Link
            href="/"
            className="inline-block border border-driftwood text-deep-current px-6 py-3 rounded-md font-semibold hover:bg-driftwood/30 transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}

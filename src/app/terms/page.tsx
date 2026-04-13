import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms & Conditions — Moontide" };

export default function TermsPage() {
  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue mb-3">
          Terms &amp; Conditions
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mb-10" />

        <div className="space-y-8 text-deep-ocean leading-relaxed">
          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              Bookings and Cancellations
            </h2>
            <p>
              All purchases are non-refundable. Please contact me directly if
              you would like to cancel or reschedule a class. Should I have to
              cancel a class, a credit will be issued and can be transferred to
              another class at a suitable time, subject to availability.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-deep-tide-blue mb-3">
              Bundles
            </h2>
            <p>Class bundles will expire 90 days from the date of purchase.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

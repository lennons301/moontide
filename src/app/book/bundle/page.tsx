import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Six Class Bundle — Moontide" };

export default function BookBundlePage() {
  return (
    <section className="py-16 px-6 bg-foam-white">
      <div className="max-w-lg mx-auto text-center">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-current mb-3">
          Six Class Bundle
        </h1>
        <div className="w-8 h-0.5 bg-lunar-gold mx-auto mb-8" />
        <p className="text-deep-ocean leading-relaxed mb-6">
          Online booking is coming soon. In the meantime, please get in touch directly to
          purchase a bundle.
        </p>
        <Link
          href="/contact"
          className="inline-block bg-lunar-gold text-deep-current px-6 py-3 rounded-md font-semibold hover:bg-lunar-gold/90 transition-colors"
        >
          Contact Me
        </Link>
      </div>
    </section>
  );
}

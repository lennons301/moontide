import Link from "next/link";

export function BookingOptions() {
  return (
    <section className="bg-white py-16 px-6 border-t border-driftwood">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-xl font-semibold text-deep-current mb-1">
          Book a class
        </h2>
        <div className="w-8 h-0.5 bg-lunar-gold mx-auto mb-8" />
        <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
          <Link
            href="/book"
            className="flex flex-col items-center p-6 border border-driftwood rounded-lg hover:border-lunar-gold transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-lunar-gold/80 mb-3" />
            <span className="text-sm font-semibold text-deep-current">
              Individual Class
            </span>
          </Link>
          <Link
            href="/book/bundle"
            className="flex flex-col items-center p-6 border border-driftwood rounded-lg hover:border-lunar-gold transition-colors"
          >
            <div className="flex gap-1 mb-3">
              <div className="w-3 h-3 rounded-full bg-lunar-gold/40" />
              <div className="w-3 h-3 rounded-full bg-lunar-gold/60" />
              <div className="w-3 h-3 rounded-full bg-lunar-gold/80" />
              <div className="w-3 h-3 rounded-full bg-lunar-gold" />
            </div>
            <span className="text-sm font-semibold text-deep-current">
              Six Class Bundle
            </span>
          </Link>
        </div>
        <p className="mt-6 text-sm text-deep-ocean">
          For all other enquiries, please{" "}
          <Link
            href="/contact"
            className="text-lunar-gold underline hover:text-lunar-gold/80"
          >
            get in touch
          </Link>
        </p>
      </div>
    </section>
  );
}

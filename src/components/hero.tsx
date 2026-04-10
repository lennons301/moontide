import Image from "next/image";
import Link from "next/link";

interface HeroProps {
  imageUrl?: string;
}

export function Hero({ imageUrl }: HeroProps) {
  return (
    <section className="relative min-h-[70vh] flex items-center justify-center">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt="Moon over water"
          fill
          className="object-cover"
          priority
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-shallow-water via-driftwood/50 to-foam-white" />
      )}
      <div className="relative z-10 text-center px-6 py-16">
        <h1 className="text-4xl md:text-5xl font-light tracking-[0.12em] text-deep-current mb-4">
          Moontide
        </h1>
        <p className="text-deep-ocean max-w-md mx-auto mb-2 italic">moontide</p>
        <p className="text-sm text-deep-ocean mb-1">/ˈmuːn.taɪd/ · noun</p>
        <p className="text-deep-ocean max-w-sm mx-auto mb-8 leading-relaxed">
          The pull of the moon on the tides — a reminder that change is natural,
          cyclical, and part of who we are.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/book"
            className="bg-lunar-gold text-deep-current px-6 py-3 rounded-md font-semibold text-sm hover:bg-lunar-gold/90 transition-colors"
          >
            Book a Class
          </Link>
          <Link
            href="/about"
            className="border border-deep-current text-deep-current px-6 py-3 rounded-md text-sm hover:bg-deep-current hover:text-foam-white transition-colors"
          >
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}

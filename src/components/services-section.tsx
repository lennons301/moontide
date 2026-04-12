import Image from "next/image";
import Link from "next/link";
import { urlFor } from "@/lib/sanity/client";
import type { Service } from "@/lib/sanity/types";

function ClassGrid({ services }: { services: Service[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {services.map((service) => {
        const imageUrl = service.image
          ? urlFor(service.image).width(600).height(400).url()
          : null;

        return (
          <Link
            key={service._id}
            href={`/classes/${service.slug.current}`}
            className="group relative aspect-[4/3] rounded-lg overflow-hidden bg-shallow-water/30"
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={service.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-b from-shallow-water/20 to-shallow-water/40" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-deep-current/60 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center p-3">
              <h3 className="text-base md:text-xl font-semibold text-foam-white text-center font-[family-name:var(--font-heading)]">
                {service.title}
              </h3>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function FeaturedCard({
  service,
  reverse = false,
}: {
  service: Service;
  reverse?: boolean;
}) {
  const imageUrl = service.image
    ? urlFor(service.image).width(600).height(400).url()
    : null;

  const ctaHref =
    service.bookingType === "contact"
      ? `/contact?subject=${encodeURIComponent(service.title)}`
      : service.bookingType === "info"
        ? service.category === "community"
          ? "/community"
          : `/classes/${service.slug.current}`
        : "/book";

  const ctaLabel =
    service.bookingType === "contact" ? "Contact me" : "More info";

  const detailHref =
    service.category === "coaching"
      ? "/coaching"
      : service.category === "private"
        ? "/private"
        : `/classes/${service.slug.current}`;

  return (
    <div
      className={`flex flex-col md:flex-row gap-4 items-center ${reverse ? "md:flex-row-reverse" : ""}`}
    >
      <Link
        href={detailHref}
        className="relative w-full md:w-1/2 aspect-[4/3] rounded-lg overflow-hidden bg-shallow-water/30 group"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={service.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-shallow-water/20 to-driftwood/40" />
        )}
      </Link>
      <div className="w-full md:w-1/2 py-2">
        <h3 className="text-lg font-semibold text-deep-current mb-2">
          {service.title}
        </h3>
        {service.shortDescription && (
          <p className="text-deep-ocean leading-relaxed mb-4">
            {service.shortDescription}
          </p>
        )}
        <div className="flex gap-3 items-center">
          <Link
            href={ctaHref}
            className="bg-lunar-gold text-foam-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-lunar-gold/90 transition-colors"
          >
            {ctaLabel}
          </Link>
          <Link
            href={detailHref}
            className="text-deep-ocean text-sm border-b border-deep-ocean hover:text-lunar-gold hover:border-lunar-gold transition-colors"
          >
            More info
          </Link>
        </div>
      </div>
    </div>
  );
}

function CommunityCard({ service }: { service: Service }) {
  return (
    <div className="border-l-2 border-lunar-gold pl-6 py-2">
      <h3 className="text-lg font-semibold text-deep-current mb-2">
        {service.title}
      </h3>
      {service.shortDescription && (
        <p className="text-deep-ocean leading-relaxed mb-3">
          {service.shortDescription}
        </p>
      )}
      <Link
        href="/community"
        className="text-lunar-gold font-semibold text-sm hover:text-lunar-gold/80 transition-colors"
      >
        More info &rarr;
      </Link>
    </div>
  );
}

export function ServicesSection({ services }: { services: Service[] }) {
  const classes = services.filter((s) => s.category === "class");
  const coaching = services.find((s) => s.category === "coaching");
  const community = services.find((s) => s.category === "community");
  const privateService = services.find((s) => s.category === "private");

  return (
    <section className="py-16 px-6">
      <div className="max-w-4xl mx-auto space-y-16">
        {/* Classes — 2x2 photo grid */}
        {classes.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold text-deep-current mb-1">
              Classes
            </h2>
            <div className="w-8 h-0.5 bg-lunar-gold mb-6" />
            <ClassGrid services={classes} />
          </div>
        )}

        {/* Coaching — featured card */}
        {coaching && (
          <div>
            <h2 className="text-xl font-semibold text-deep-current mb-1">
              Coaching
            </h2>
            <div className="w-8 h-0.5 bg-lunar-gold mb-6" />
            <FeaturedCard service={coaching} />
          </div>
        )}

        {/* Community — light treatment */}
        {community && (
          <div>
            <h2 className="text-xl font-semibold text-deep-current mb-1">
              Community
            </h2>
            <div className="w-8 h-0.5 bg-lunar-gold mb-6" />
            <CommunityCard service={community} />
          </div>
        )}

        {/* Private — featured card, reversed */}
        {privateService && (
          <div>
            <h2 className="text-xl font-semibold text-deep-current mb-1">
              Private Classes
            </h2>
            <div className="w-8 h-0.5 bg-lunar-gold mb-6" />
            <FeaturedCard service={privateService} reverse />
          </div>
        )}
      </div>
    </section>
  );
}

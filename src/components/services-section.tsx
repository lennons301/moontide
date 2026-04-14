import Image from "next/image";
import Link from "next/link";
import { urlFor } from "@/lib/sanity/client";
import type { Service } from "@/lib/sanity/types";

function ClassGrid({ services }: { services: Service[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {services.map((service) => {
        const imageUrl = service.image
          ? urlFor(service.image).width(600).height(400).url()
          : null;

        return (
          <Link
            key={service._id}
            href={`/classes/${service.slug.current}`}
            className="group relative aspect-[4/3] rounded-lg overflow-hidden bg-ocean-light-blue/30"
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={service.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-b from-ocean-light-blue/20 to-ocean-light-blue/40" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-deep-tide-blue/60 to-transparent group-hover:from-deep-tide-blue/80 group-hover:to-deep-tide-blue/40 transition-all duration-300" />
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
              <h3 className="text-base md:text-xl font-semibold text-dawn-light font-[family-name:var(--font-heading)]">
                {service.title}
              </h3>
              {service.shortDescription && (
                <p className="text-dawn-light/0 group-hover:text-dawn-light/90 text-sm leading-relaxed mt-2 max-w-[90%] transition-colors duration-300">
                  {service.shortDescription}
                </p>
              )}
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
        className="relative w-full md:w-1/2 aspect-[4/3] rounded-lg overflow-hidden bg-ocean-light-blue/30 group"
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={service.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-ocean-light-blue/20 to-soft-moonstone/40" />
        )}
      </Link>
      <div className="w-full md:w-1/2 py-2">
        <h3 className="text-lg font-semibold text-deep-tide-blue mb-2">
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
            className="bg-bright-orange text-dawn-light px-5 py-2 rounded-md text-sm font-semibold hover:bg-bright-orange/90 transition-colors"
          >
            {ctaLabel}
          </Link>
          <Link
            href={detailHref}
            className="text-deep-ocean text-sm border-b border-deep-ocean hover:text-bright-orange hover:border-bright-orange transition-colors"
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
    <div className="border-l-2 border-bright-orange pl-6 py-2">
      <h3 className="text-lg font-semibold text-deep-tide-blue mb-2">
        {service.title}
      </h3>
      {service.shortDescription && (
        <p className="text-deep-ocean leading-relaxed mb-3">
          {service.shortDescription}
        </p>
      )}
      <Link
        href="/community"
        className="text-bright-orange font-semibold text-sm hover:text-bright-orange/80 transition-colors"
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
    <>
      {/* Classes — Dawn Light */}
      {classes.length > 0 && (
        <section className="py-16 px-6 bg-dawn-light">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-semibold text-deep-tide-blue mb-1">
              Classes
            </h2>
            <div className="w-8 h-0.5 bg-bright-orange mb-6" />
            <ClassGrid services={classes} />
          </div>
        </section>
      )}

      {/* Coaching — white */}
      {coaching && (
        <section className="py-16 px-6 bg-white">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-semibold text-deep-tide-blue mb-1">
              Coaching
            </h2>
            <div className="w-8 h-0.5 bg-bright-orange mb-6" />
            <FeaturedCard service={coaching} />
          </div>
        </section>
      )}

      {/* Community — Dawn Light */}
      {community && (
        <section className="py-16 px-6 bg-dawn-light">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-semibold text-deep-tide-blue mb-1">
              Community
            </h2>
            <div className="w-8 h-0.5 bg-bright-orange mb-6" />
            <CommunityCard service={community} />
          </div>
        </section>
      )}

      {/* Private — white */}
      {privateService && (
        <section className="py-16 px-6 bg-white">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl font-semibold text-deep-tide-blue mb-1">
              Private Classes
            </h2>
            <div className="w-8 h-0.5 bg-bright-orange mb-6" />
            <FeaturedCard service={privateService} reverse />
          </div>
        </section>
      )}
    </>
  );
}

import Image from "next/image";
import Link from "next/link";
import { urlFor } from "@/lib/sanity/client";
import type { Service } from "@/lib/sanity/types";

function getCtaConfig(service: Service) {
  switch (service.bookingType) {
    case "contact":
      return {
        label: "Contact Me",
        href: `/contact?subject=${encodeURIComponent(service.title)}`,
      };
    case "info":
      return null;
    default:
      return { label: "Book a Class", href: "/book" };
  }
}

function getDetailHref(service: Service) {
  switch (service.category) {
    case "coaching":
      return "/coaching";
    case "community":
      return "/community";
    case "private":
      return "/private";
    default:
      return `/classes/${service.slug.current}`;
  }
}

export function ServiceCard({ service }: { service: Service }) {
  const cta = getCtaConfig(service);
  const detailHref = getDetailHref(service);
  const imageUrl = service.image
    ? urlFor(service.image).width(800).height(400).url()
    : null;

  return (
    <div className="border-t border-driftwood">
      <div className="relative h-48 md:h-64 bg-shallow-water/30">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={service.title}
            fill
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-deep-ocean/40">
            [ Photography — {service.title.toLowerCase()} ]
          </div>
        )}
      </div>
      <div className="px-6 py-6 bg-foam-white">
        <h3 className="text-lg font-semibold text-deep-current mb-2">
          {service.title}
        </h3>
        {service.shortDescription && (
          <p className="text-deep-ocean leading-relaxed mb-4">
            {service.shortDescription}
          </p>
        )}
        <div className="flex gap-3 items-center">
          {cta && (
            <Link
              href={cta.href}
              className="bg-lunar-gold text-deep-current px-5 py-2 rounded-md text-sm font-semibold hover:bg-lunar-gold/90 transition-colors"
            >
              {cta.label}
            </Link>
          )}
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

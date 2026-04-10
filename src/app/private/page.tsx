import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { sanityClient } from "@/lib/sanity/client";
import { urlFor } from "@/lib/sanity/client";
import { serviceBySlugQuery } from "@/lib/sanity/queries";
import type { Service } from "@/lib/sanity/types";
import { PortableText } from "next-sanity";

export const metadata: Metadata = { title: "Private Classes — Moontide" };

export default async function PrivatePage() {
  let service: Service | null = null;
  try {
    service = await sanityClient.fetch<Service>(serviceBySlugQuery, { slug: "private" });
  } catch {
    // Sanity not connected yet — use fallback content
  }

  const imageUrl = service?.image ? urlFor(service.image).width(1200).height(500).url() : null;

  return (
    <>
      {/* Hero image */}
      <div className="relative h-64 md:h-96 bg-shallow-water/30">
        {imageUrl ? (
          <Image src={imageUrl} alt="Private Classes" fill className="object-cover" priority />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-deep-ocean/40">
            [ Photography — private classes ]
          </div>
        )}
      </div>

      <section className="py-12 px-6 bg-foam-white">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-semibold text-deep-current mb-3">
            Private Classes
          </h1>
          <div className="w-8 h-0.5 bg-lunar-gold mb-8" />

          <div className="text-deep-ocean leading-relaxed mb-10 space-y-4">
            {service?.fullDescription ? (
              <div className="prose prose-stone">
                <PortableText value={service.fullDescription} />
              </div>
            ) : (
              <p>
                Everyone comes to the mat for different reasons. Private classes are highly
                personalised to your desired outcomes for mind, body and spirit.
              </p>
            )}
          </div>

          <Link
            href="/contact?subject=Private+Classes"
            className="inline-block bg-lunar-gold text-deep-current px-6 py-3 rounded-md font-semibold hover:bg-lunar-gold/90 transition-colors"
          >
            Contact Me
          </Link>
        </div>
      </section>
    </>
  );
}

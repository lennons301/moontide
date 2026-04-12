import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PortableText } from "next-sanity";
import { sanityClient, urlFor } from "@/lib/sanity/client";
import { serviceBySlugQuery } from "@/lib/sanity/queries";
import type { Service } from "@/lib/sanity/types";

export const metadata: Metadata = {
  title: "Transformational Coaching — Moontide",
};

const fallbackDescription = `Life is full of transitions — some chosen, some not. Transformational coaching offers a dedicated space to explore what is shifting in your life, to identify what you truly want, and to move forward with clarity and confidence.

Working one-to-one, we will draw on a range of embodied and somatic practices alongside coaching methodologies to support you in reconnecting with your own wisdom. Whether you are navigating a career change, a shift in identity, a relationship transition or simply a sense that something needs to change, coaching can help you find your way.

Sessions are held online or in person, and are tailored entirely to you.`;

export default async function CoachingPage() {
  let service: Service | null = null;
  try {
    service = await sanityClient.fetch<Service>(serviceBySlugQuery, {
      slug: "coaching",
    });
  } catch {
    // Sanity not connected yet — use fallback content
  }

  const imageUrl = service?.image
    ? urlFor(service.image).width(1200).height(500).url()
    : null;

  return (
    <>
      {/* Hero image */}
      <div className="relative h-64 md:h-96 bg-shallow-water/30">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt="Transformational Coaching"
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-deep-ocean/40">
            [ Photography — transformational coaching ]
          </div>
        )}
      </div>

      <section className="py-12 px-6 bg-foam-white">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-semibold text-deep-current mb-3">
            Transformational Coaching
          </h1>
          <div className="w-8 h-0.5 bg-lunar-gold mb-8" />

          <div className="text-deep-ocean leading-relaxed mb-10 space-y-4">
            {service?.fullDescription ? (
              <div className="prose prose-stone">
                <PortableText value={service.fullDescription} />
              </div>
            ) : (
              fallbackDescription
                .split("\n\n")
                .map((para, i) => <p key={i}>{para}</p>)
            )}
          </div>

          <Link
            href="/contact?subject=Transformational+Coaching"
            className="inline-block bg-lunar-gold text-foam-white px-6 py-3 rounded-md font-semibold hover:bg-lunar-gold/90 transition-colors"
          >
            Contact Me
          </Link>
        </div>
      </section>
    </>
  );
}

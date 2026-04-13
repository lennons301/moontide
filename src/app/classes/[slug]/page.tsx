import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PortableText } from "next-sanity";
import { sanityClient, urlFor } from "@/lib/sanity/client";
import { serviceBySlugQuery } from "@/lib/sanity/queries";
import type { Service } from "@/lib/sanity/types";

const knownSlugs = ["prenatal", "postnatal", "baby-yoga", "vinyasa"];

const fallbackContent: Record<string, { title: string; description: string }> =
  {
    prenatal: {
      title: "Prenatal Yoga",
      description:
        "Gentle movement and breath work to support you and your baby through pregnancy. These classes are designed to ease common discomforts, build strength and flexibility, and nurture a deep connection with your growing baby. Suitable from the second trimester onwards.",
    },
    postnatal: {
      title: "Postnatal Yoga",
      description:
        "Rebuild strength and connection in the months after birth. These classes offer a gentle, supported return to movement, focusing on pelvic floor health, core reconnection and emotional wellbeing. Babies are welcome and encouraged to join.",
    },
    "baby-yoga": {
      title: "Baby Yoga & Massage",
      description:
        "Bonding, relaxation and developmental support for you and your baby. Through gentle massage strokes and playful yoga-inspired movements, you will learn to read your baby's cues, support their physical development, and deepen your bond through touch.",
    },
    vinyasa: {
      title: "Vinyasa Yoga Seasonal Flow",
      description:
        "Seasonal flow connecting your practice to nature's rhythms. Each series honours the qualities of the season — the stillness of winter, the renewal of spring, the abundance of summer, the release of autumn — weaving breath, movement and reflection into a practice that feels alive.",
    },
  };

export async function generateStaticParams() {
  return knownSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const fallback = fallbackContent[slug];
  const title = fallback?.title ?? "Class — Moontide";
  return { title: `${title} — Moontide` };
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let service: Service | null = null;
  try {
    service = await sanityClient.fetch<Service>(serviceBySlugQuery, { slug });
  } catch {
    // Sanity not connected yet — use fallback content
  }

  const fallback = fallbackContent[slug];
  const title = service?.title ?? fallback?.title ?? "Class";
  const imageUrl = service?.image
    ? urlFor(service.image).width(1200).height(500).url()
    : null;

  return (
    <>
      {/* Hero image */}
      <div className="relative h-64 md:h-96 bg-ocean-light-blue/30">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-deep-ocean/40">
            [ Photography — {title.toLowerCase()} ]
          </div>
        )}
      </div>

      <section className="py-12 px-6 bg-dawn-light">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue mb-3">
            {title}
          </h1>
          <div className="w-8 h-0.5 bg-bright-orange mb-8" />

          <div className="text-deep-ocean leading-relaxed mb-10">
            {service?.fullDescription ? (
              <div className="prose prose-stone">
                <PortableText value={service.fullDescription} />
              </div>
            ) : (
              <p>{fallback?.description ?? "Class details coming soon."}</p>
            )}
          </div>

          <Link
            href="/book"
            className="inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
          >
            Book a Class
          </Link>
        </div>
      </section>
    </>
  );
}

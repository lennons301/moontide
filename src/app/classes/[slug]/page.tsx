import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { PortableText } from "next-sanity";
import { resolveCurrentSlug } from "@/lib/classes/slug-redirects";
import { getService } from "@/lib/content/services";
import { urlFor } from "@/lib/sanity/client";

export const revalidate = 3600;

const knownSlugs = ["prenatal", "postnatal", "baby-yoga", "vinyasa"];

export async function generateStaticParams() {
  return knownSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { title } = await getService(slug);
  return { title: `${title} — Moontide` };
}

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // A slug the admin editor has since renamed away from redirects on to
  // whatever is current, in one hop however many renames sit in between —
  // `resolveCurrentSlug` always names the class's live slug, never the next
  // link in a chain.
  const currentSlug = await resolveCurrentSlug(slug);
  if (currentSlug) {
    permanentRedirect(`/classes/${currentSlug}`);
  }

  const service = await getService(slug);
  const title = service.title;
  const imageUrl = service.image
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
            {service.fullDescription ? (
              <div className="prose prose-stone">
                <PortableText value={service.fullDescription} />
              </div>
            ) : (
              service.descriptionParagraphs.map((para, i) => (
                <p key={i}>{para}</p>
              ))
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

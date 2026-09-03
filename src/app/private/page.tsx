import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PortableText } from "next-sanity";
import { getService } from "@/lib/content/services";
import { urlFor } from "@/lib/sanity/client";

export const metadata: Metadata = { title: "Private Classes — Moontide" };

export const revalidate = 3600;

export default async function PrivatePage() {
  const service = await getService("private");

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
            alt="Private Classes"
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-deep-ocean/40">
            [ Photography — private classes ]
          </div>
        )}
      </div>

      <section className="py-12 px-6 bg-dawn-light">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue mb-3">
            Private Classes
          </h1>
          <div className="w-8 h-0.5 bg-bright-orange mb-8" />

          <div className="text-deep-ocean leading-relaxed mb-10 space-y-4">
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
            href="/contact?subject=Private+Classes"
            className="inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
          >
            Contact Me
          </Link>
        </div>
      </section>
    </>
  );
}

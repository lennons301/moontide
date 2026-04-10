import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { sanityClient } from "@/lib/sanity/client";
import { urlFor } from "@/lib/sanity/client";
import { trainerQuery } from "@/lib/sanity/queries";
import type { Trainer } from "@/lib/sanity/types";
import { PortableText } from "next-sanity";

export const metadata: Metadata = { title: "About — Moontide" };

const fallbackQualifications = [
  {
    year: "2024",
    description:
      "Pre and Postnatal Yoga Teacher Training with Baby Yoga and Massage with Katie Appleton",
  },
  {
    year: "2022",
    description: "Yin Yoga and Chakras Teacher Training, The Yoga People",
  },
  {
    year: "2021",
    description: "200 hour Vinyasa Yoga Teacher Training, More Yoga",
  },
];

const services = [
  { label: "Prenatal Yoga", href: "/classes/prenatal" },
  { label: "Postnatal Yoga", href: "/classes/postnatal" },
  { label: "Baby Yoga & Massage", href: "/classes/baby-yoga" },
  { label: "Vinyasa Yoga Seasonal Flow", href: "/classes/vinyasa" },
  { label: "Transformational Coaching", href: "/coaching" },
  { label: "Creating Community", href: "/community" },
  { label: "Private Classes", href: "/private" },
];

export default async function AboutPage() {
  let trainer: Trainer | null = null;
  try {
    trainer = await sanityClient.fetch<Trainer>(trainerQuery);
  } catch {
    // Sanity not connected yet — use fallback content
  }

  const qualifications = trainer?.qualifications ?? fallbackQualifications;
  const photoUrl = trainer?.photo ? urlFor(trainer.photo).width(320).height(320).url() : null;

  return (
    <>
      {/* Hero */}
      <section className="py-16 px-6 bg-foam-white">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-semibold text-deep-current mb-3">
            About Moontide
          </h1>
          <div className="w-8 h-0.5 bg-lunar-gold mx-auto" />
        </div>
      </section>

      {/* Bio */}
      <section className="py-12 px-6 bg-driftwood">
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col items-center md:flex-row md:items-start gap-8">
            {/* Photo */}
            <div className="relative w-32 h-32 rounded-full overflow-hidden shrink-0 bg-shallow-water/40">
              {photoUrl ? (
                <Image src={photoUrl} alt="Gabrielle" fill className="object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full text-xs text-deep-ocean/50">
                  Photo
                </div>
              )}
            </div>

            {/* Bio text */}
            <div>
              <h2 className="text-xl font-semibold text-deep-current mb-4">About Me</h2>
              {trainer?.bio ? (
                <div className="prose prose-stone text-deep-ocean leading-relaxed">
                  <PortableText value={trainer.bio} />
                </div>
              ) : (
                <div className="space-y-3 text-deep-ocean leading-relaxed">
                  <p>
                    Hi, I&apos;m Gabrielle — a yoga teacher and transformational coach
                    supporting women through every phase of life.
                  </p>
                  <p>
                    My practice is rooted in the belief that wellbeing is not a destination
                    but a living, breathing relationship with ourselves. Through movement,
                    breath and community, I create spaces where women can slow down, come
                    home to their bodies, and move through change with grace.
                  </p>
                  <p>
                    Whether you&apos;re navigating pregnancy, early motherhood, or simply
                    seeking more stillness in your day-to-day life, I&apos;m here to support
                    your journey.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Qualifications */}
      <section className="py-12 px-6 bg-foam-white">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-deep-current mb-6">
            Gabrielle&apos;s Trainings
          </h2>
          <ul className="space-y-4">
            {qualifications.map((q, i) => (
              <li key={i} className="flex gap-4 items-start">
                <span className="text-lunar-gold font-semibold text-sm mt-0.5 shrink-0 w-10">
                  {q.year}
                </span>
                <span className="text-deep-ocean leading-relaxed">{q.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Services */}
      <section className="py-12 px-6 bg-driftwood">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-deep-current mb-6">Services</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {services.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="block px-4 py-3 bg-foam-white rounded-md text-deep-ocean hover:text-lunar-gold hover:bg-foam-white/80 transition-colors border border-driftwood text-sm font-medium"
                >
                  {s.label} &rarr;
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

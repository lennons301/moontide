import type { Metadata } from "next";
import Image from "next/image";
import { PortableText } from "next-sanity";
import { sanityClient, urlFor } from "@/lib/sanity/client";
import { communityEventsQuery, serviceBySlugQuery } from "@/lib/sanity/queries";
import type { CommunityEvent, Service } from "@/lib/sanity/types";

export const metadata: Metadata = { title: "Creating Community — Moontide" };

const fallbackDescription = `Connection is at the heart of everything I do. Creating Community is about bringing women together to share, to grow and to be seen — away from the relentless pace of everyday life.

Gatherings take the form of seasonal rituals, workshops, day retreats and online events. Each one is thoughtfully held, weaving together movement, reflection, conversation and rest.

Whether you are new to this kind of gathering or have been part of women's circles for years, all are welcome.`;

export default async function CommunityPage() {
  let service: Service | null = null;
  let events: CommunityEvent[] = [];

  try {
    service = await sanityClient.fetch<Service>(serviceBySlugQuery, {
      slug: "community",
    });
  } catch {
    // Sanity not connected yet — use fallback content
  }

  try {
    const fetched =
      await sanityClient.fetch<CommunityEvent[]>(communityEventsQuery);
    events = fetched ?? [];
  } catch {
    // Sanity not connected yet
  }

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
            alt="Creating Community"
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-deep-ocean/40">
            [ Photography — creating community ]
          </div>
        )}
      </div>

      <section className="py-12 px-6 bg-dawn-light">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue mb-3">
            Creating Community
          </h1>
          <div className="w-8 h-0.5 bg-bright-orange mb-8" />

          <div className="text-deep-ocean leading-relaxed mb-12 space-y-4">
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
        </div>
      </section>

      {/* Upcoming dates */}
      <section className="py-12 px-6 bg-soft-moonstone">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-semibold text-deep-tide-blue mb-6">
            Upcoming Dates
          </h2>

          {events.length > 0 ? (
            <ul className="space-y-6">
              {events.map((event) => (
                <li
                  key={event._id}
                  className="bg-dawn-light rounded-md px-5 py-4 border border-soft-moonstone"
                >
                  <p className="text-bright-orange text-sm font-semibold mb-1">
                    {event.date
                      ? new Date(event.date).toLocaleDateString("en-GB", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "Date TBC"}
                  </p>
                  <h3 className="text-deep-tide-blue font-semibold mb-1">
                    {event.title}
                  </h3>
                  {event.location && (
                    <p className="text-deep-ocean text-sm mb-1">
                      {event.location}
                    </p>
                  )}
                  {event.description && (
                    <p className="text-deep-ocean text-sm leading-relaxed">
                      {event.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-deep-ocean">Key dates for 2026 — coming soon.</p>
          )}
        </div>
      </section>
    </>
  );
}

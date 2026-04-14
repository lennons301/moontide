import { AboutPreview } from "@/components/about-preview";
import { BookingOptions } from "@/components/booking-options";
import { ContactForm } from "@/components/contact-form";
import { Hero } from "@/components/hero";
import { ServicesSection } from "@/components/services-section";
import { sanityClient, urlFor } from "@/lib/sanity/client";
import {
  servicesQuery,
  siteSettingsQuery,
  trainerQuery,
} from "@/lib/sanity/queries";
import type { Service, SiteSettings, Trainer } from "@/lib/sanity/types";

export const revalidate = 3600;

export default async function HomePage() {
  const [services, trainer, siteSettings] = await Promise.all([
    sanityClient.fetch<Service[]>(servicesQuery),
    sanityClient.fetch<Trainer | null>(trainerQuery),
    sanityClient.fetch<SiteSettings | null>(siteSettingsQuery),
  ]);

  const photoUrl = trainer?.photo
    ? urlFor(trainer.photo).width(160).height(160).url()
    : undefined;

  return (
    <>
      <Hero tagline={siteSettings?.heroTagline ?? undefined} />
      <BookingOptions />
      <ServicesSection services={services} />
      {trainer && (
        <AboutPreview
          name={trainer.name}
          shortBio={
            trainer.shortBio ??
            "Yoga teacher and transformational coach supporting women through every phase of life."
          }
          photoUrl={photoUrl}
        />
      )}
      <section className="py-16 px-6 bg-dawn-light">
        <div className="max-w-lg mx-auto">
          <h2 className="text-xl font-semibold text-deep-tide-blue text-center mb-1">
            Leave a message
          </h2>
          <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-8" />
          <ContactForm />
        </div>
      </section>
    </>
  );
}

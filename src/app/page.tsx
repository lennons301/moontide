import { AboutPreview } from "@/components/about-preview";
import { BookingOptions } from "@/components/booking-options";
import { ContactForm } from "@/components/contact-form";
import { Hero } from "@/components/hero";
import { ServicesSection } from "@/components/services-section";
import { sanityClient } from "@/lib/sanity/client";
import { servicesQuery, trainerQuery } from "@/lib/sanity/queries";
import type { Service, Trainer } from "@/lib/sanity/types";

export const revalidate = 60; // Revalidate CMS content every 60 seconds

export default async function HomePage() {
  const [services, trainer] = await Promise.all([
    sanityClient.fetch<Service[]>(servicesQuery),
    sanityClient.fetch<Trainer | null>(trainerQuery),
  ]);

  return (
    <>
      <Hero />
      <BookingOptions />
      <ServicesSection services={services} />
      {trainer && (
        <AboutPreview
          name={trainer.name}
          shortBio="Yoga teacher and transformational coach supporting women through every phase of life."
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

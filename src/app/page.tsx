import { AboutPreview } from "@/components/about-preview";
import { BookingOptions } from "@/components/booking-options";
import { ContactForm } from "@/components/contact-form";
import { Hero } from "@/components/hero";
import { ServicesSection } from "@/components/services-section";
import { loadHomepageContent } from "@/lib/content/homepage";
import { urlFor } from "@/lib/sanity/client";

export const revalidate = 3600;

export default async function HomePage() {
  const { heroTagline, services, trainer } = await loadHomepageContent();

  const photoUrl = trainer.photo
    ? urlFor(trainer.photo).width(160).height(160).url()
    : undefined;

  return (
    <>
      <Hero tagline={heroTagline} />
      <BookingOptions />
      <ServicesSection services={services} />
      <AboutPreview
        name={trainer.name}
        shortBio={trainer.shortBio}
        photoUrl={photoUrl}
      />
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

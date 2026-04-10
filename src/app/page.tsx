import { Hero } from "@/components/hero";
import { BookingOptions } from "@/components/booking-options";
import { ServicesSection } from "@/components/services-section";
import { AboutPreview } from "@/components/about-preview";
import { ContactForm } from "@/components/contact-form";
import type { Service } from "@/lib/sanity/types";

// Placeholder services until Sanity CMS is connected
const placeholderServices: Service[] = [
  {
    _id: "1",
    title: "Prenatal Yoga",
    slug: { current: "prenatal" },
    shortDescription: "Gentle movement and breath work to support you and your baby through pregnancy.",
    category: "class",
    bookingType: "stripe",
    displayOrder: 1,
  },
  {
    _id: "2",
    title: "Postnatal Yoga",
    slug: { current: "postnatal" },
    shortDescription: "Rebuild strength and connection in the months after birth.",
    category: "class",
    bookingType: "stripe",
    displayOrder: 2,
  },
  {
    _id: "3",
    title: "Baby Yoga & Massage",
    slug: { current: "baby-yoga" },
    shortDescription: "Bonding, relaxation and developmental support for you and your baby.",
    category: "class",
    bookingType: "stripe",
    displayOrder: 3,
  },
  {
    _id: "4",
    title: "Vinyasa Yoga Seasonal Flow",
    slug: { current: "vinyasa" },
    shortDescription: "Seasonal flow connecting your practice to nature's rhythms.",
    category: "class",
    bookingType: "stripe",
    displayOrder: 4,
  },
  {
    _id: "5",
    title: "Transformational Coaching",
    slug: { current: "coaching" },
    shortDescription: "One-to-one coaching to support you through life's transitions.",
    category: "coaching",
    bookingType: "contact",
    displayOrder: 5,
  },
  {
    _id: "6",
    title: "Creating Community",
    slug: { current: "community" },
    shortDescription: "Gatherings and events for women to connect, share and grow together.",
    category: "community",
    bookingType: "info",
    displayOrder: 6,
  },
  {
    _id: "7",
    title: "Private Classes",
    slug: { current: "private" },
    shortDescription: "Everyone comes to the mat for different reasons. Private classes are highly personalised to your desired outcomes for mind, body and spirit.",
    category: "private",
    bookingType: "contact",
    displayOrder: 7,
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <BookingOptions />
      <ServicesSection services={placeholderServices} />
      <AboutPreview
        name="Gabrielle"
        shortBio="Yoga teacher and transformational coach supporting women through every phase of life."
      />
      <section className="py-16 px-6 bg-foam-white">
        <div className="max-w-lg mx-auto">
          <h2 className="text-xl font-semibold text-deep-current text-center mb-1">
            Leave a message
          </h2>
          <div className="w-8 h-0.5 bg-lunar-gold mx-auto mb-8" />
          <ContactForm />
        </div>
      </section>
    </>
  );
}

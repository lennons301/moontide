import { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = { title: "Contact — Moontide" };

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;

  return (
    <section className="py-16 px-6 bg-foam-white">
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-current text-center mb-3">
          Get in Touch
        </h1>
        <div className="w-8 h-0.5 bg-lunar-gold mx-auto mb-10" />
        <ContactForm defaultSubject={subject} />
      </div>
    </section>
  );
}

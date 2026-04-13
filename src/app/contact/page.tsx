import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";

export const metadata: Metadata = { title: "Contact — Moontide" };

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const { subject } = await searchParams;

  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue text-center mb-3">
          Get in Touch
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-10" />
        <ContactForm defaultSubject={subject} />
      </div>
    </section>
  );
}

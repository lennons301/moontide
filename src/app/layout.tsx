import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Playfair_Display,
  Source_Sans_3,
} from "next/font/google";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { sanityClient } from "@/lib/sanity/client";
import { siteSettingsQuery } from "@/lib/sanity/queries";
import type { SiteSettings } from "@/lib/sanity/types";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-heading",
  subsets: ["latin"],
  display: "swap",
});

const sourceSans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-accent",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Moontide — Yoga, Coaching & Embodied Connection",
  description:
    "Wellbeing for women navigating change through yoga, coaching and embodied connection.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteSettings = await sanityClient.fetch<SiteSettings | null>(
    siteSettingsQuery,
  );

  return (
    <html
      lang="en"
      className={`${playfair.variable} ${sourceSans.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav />
        <main className="flex-1">{children}</main>
        <Footer instagramUrl={siteSettings?.instagramUrl} />
      </body>
    </html>
  );
}

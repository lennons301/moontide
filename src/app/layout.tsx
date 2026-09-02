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

/**
 * The root layout wraps every route, including `/book`, which has no Sanity
 * dependency of its own. The only thing this read is used for is the footer's
 * Instagram link, so a CMS outage must cost that link and nothing else — an
 * uncaught throw here would throw inside every page's render.
 */
async function loadSiteSettings(): Promise<SiteSettings | null> {
  try {
    return await sanityClient.fetch<SiteSettings | null>(siteSettingsQuery);
  } catch {
    // Sanity unreachable — the footer renders without its Instagram link
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteSettings = await loadSiteSettings();

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

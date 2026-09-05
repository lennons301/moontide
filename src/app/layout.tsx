import type { Metadata } from "next";
import {
  Cormorant_Garamond,
  Playfair_Display,
  Source_Sans_3,
} from "next/font/google";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { getClassCatalogue } from "@/lib/content/services";
import { getSiteSettings } from "@/lib/content/site-settings";
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
 * dependency of its own. The only thing its site-settings read is used for is
 * the footer's Instagram link, so a CMS outage must cost that link and nothing
 * else — an uncaught throw here would throw inside every page's render.
 * `getSiteSettings` is where that is guaranteed.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [siteSettings, classCatalogue] = await Promise.all([
    getSiteSettings(),
    getClassCatalogue(),
  ]);

  return (
    <html
      lang="en"
      className={`${playfair.variable} ${sourceSans.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Nav classes={classCatalogue} />
        <main className="flex-1">{children}</main>
        <Footer
          instagramUrl={siteSettings.instagramUrl}
          classes={classCatalogue}
        />
      </body>
    </html>
  );
}

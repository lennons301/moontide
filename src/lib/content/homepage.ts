import { sanityClient } from "@/lib/sanity/client";
import {
  servicesQuery,
  siteSettingsQuery,
  trainerQuery,
} from "@/lib/sanity/queries";
import type { Service, SiteSettings, Trainer } from "@/lib/sanity/types";

/**
 * The homepage's three CMS-backed sections, each with hardcoded content to fall
 * back to. Every other content page already does this inline; the homepage used
 * to fetch all three in one `Promise.all` and hard-fail on a Sanity outage.
 *
 * Each section is fetched and caught separately, so one failing query (or one
 * empty document) degrades that section alone.
 */

export const fallbackServices: Service[] = [
  {
    _id: "fallback-prenatal",
    title: "Prenatal Yoga",
    slug: { current: "prenatal" },
    shortDescription:
      "Gentle movement and breath work to support you and your baby through pregnancy.",
    category: "class",
    bookingType: "stripe",
    displayOrder: 1,
  },
  {
    _id: "fallback-postnatal",
    title: "Postnatal Yoga",
    slug: { current: "postnatal" },
    shortDescription:
      "Rebuild strength and connection in the months after birth.",
    category: "class",
    bookingType: "stripe",
    displayOrder: 2,
  },
  {
    _id: "fallback-baby-yoga",
    title: "Baby Yoga & Massage",
    slug: { current: "baby-yoga" },
    shortDescription:
      "Bonding, relaxation and developmental support for you and your baby.",
    category: "class",
    bookingType: "stripe",
    displayOrder: 3,
  },
  {
    _id: "fallback-vinyasa",
    title: "Autumn Equinox Yin",
    slug: { current: "vinyasa" },
    shortDescription:
      "Seasonal flow connecting your practice to nature's rhythms.",
    category: "class",
    bookingType: "stripe",
    displayOrder: 4,
  },
  {
    _id: "fallback-coaching",
    title: "Transformational Coaching",
    slug: { current: "coaching" },
    shortDescription:
      "One-to-one coaching to support you through life's transitions.",
    category: "coaching",
    bookingType: "contact",
    displayOrder: 5,
  },
  {
    _id: "fallback-community",
    title: "Creating Community",
    slug: { current: "community" },
    shortDescription:
      "Gatherings and events for women to connect, share and grow together.",
    category: "community",
    bookingType: "info",
    displayOrder: 6,
  },
  {
    _id: "fallback-private",
    title: "Private Classes",
    slug: { current: "private" },
    shortDescription:
      "Everyone comes to the mat for different reasons. Private classes are highly personalised to your desired outcomes for mind, body and spirit.",
    category: "private",
    bookingType: "contact",
    displayOrder: 7,
  },
];

export const fallbackTrainerName = "Gabrielle";

export const fallbackTrainerShortBio =
  "Yoga teacher and transformational coach supporting women through every phase of life.";

export interface HomepageContent {
  /** Undefined leaves the Hero on its own hardcoded tagline. */
  heroTagline: string | undefined;
  services: Service[];
  trainer: {
    name: string;
    shortBio: string;
    /** Absent when the CMS is unreachable or holds no photo. */
    photo: Trainer["photo"];
  };
}

async function fetchOrNull<T>(query: string): Promise<T | null> {
  try {
    return await sanityClient.fetch<T | null>(query);
  } catch {
    // Sanity unreachable — the caller falls back to hardcoded content
    return null;
  }
}

export async function loadHomepageContent(): Promise<HomepageContent> {
  const [services, trainer, siteSettings] = await Promise.all([
    fetchOrNull<Service[]>(servicesQuery),
    fetchOrNull<Trainer>(trainerQuery),
    fetchOrNull<SiteSettings>(siteSettingsQuery),
  ]);

  return {
    heroTagline: siteSettings?.heroTagline ?? undefined,
    services: services?.length ? services : fallbackServices,
    trainer: {
      name: trainer?.name ?? fallbackTrainerName,
      shortBio: trainer?.shortBio ?? fallbackTrainerShortBio,
      photo: trainer?.photo,
    },
  };
}

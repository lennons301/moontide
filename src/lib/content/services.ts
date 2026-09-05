import { eq } from "drizzle-orm";
import type { Image, PortableTextBlock } from "sanity";
import { db } from "@/lib/db";
import { classes } from "@/lib/db/schema";
import { serviceBySlugQuery, servicesQuery } from "@/lib/sanity/queries";
import type { Service } from "@/lib/sanity/types";
import {
  fallbackServiceBySlug,
  fallbackServices,
  unknownServiceFallback,
} from "./fallbacks";
import { fetchOrNull } from "./source";

/** One bookable class, as Postgres — the catalogue's owner — has it. */
export interface CatalogueClass {
  slug: string;
  title: string;
  category: Service["category"];
}

/**
 * The bookable classes: prenatal, postnatal, baby yoga, and whatever else
 * Gabrielle has added at `/admin/pricing`. Postgres owns a class's title and
 * slug (ADR-0001), so this is the one read nav, footer, `/about`, static
 * generation and revalidation all share — none of them enumerate the classes
 * themselves any more.
 */
export async function getClassCatalogue(): Promise<CatalogueClass[]> {
  return db
    .select({
      slug: classes.slug,
      title: classes.title,
      category: classes.category,
    })
    .from(classes)
    .where(eq(classes.active, true))
    .orderBy(classes.id);
}

/** One service, answered whether or not the CMS is reachable. */
export interface ServiceContent {
  slug: string;
  title: string;
  /**
   * Portable Text from the CMS. Absent when the CMS has nothing for this
   * service, in which case `descriptionParagraphs` is what the page renders.
   */
  fullDescription: PortableTextBlock[] | undefined;
  /** Never empty — the module's own copy for this service. */
  descriptionParagraphs: string[];
  shortDescription: string | undefined;
  /** Absent when the CMS is unreachable or holds no image. */
  image: Image | undefined;
}

/**
 * The service behind a page: `/coaching`, `/private`, `/community` and every
 * `/classes/<slug>`. The fallback copy is part of the answer, so the page has
 * one thing to render rather than a CMS document and a local backup.
 *
 * A slug in the catalogue always has a Postgres title, so that is what wins —
 * Sanity's prose and image still apply, and "Class details coming soon" is
 * the only fallback left for a catalogue class Sanity has no document for.
 */
export async function getService(slug: string): Promise<ServiceContent> {
  const [catalogue, service] = await Promise.all([
    getClassCatalogue(),
    fetchOrNull<Service>(serviceBySlugQuery, { slug }),
  ]);
  const classRow = catalogue.find((c) => c.slug === slug);
  const fallback = classRow
    ? unknownServiceFallback
    : (fallbackServiceBySlug[slug] ?? unknownServiceFallback);

  return {
    slug,
    title: classRow?.title ?? service?.title ?? fallback.title,
    fullDescription: service?.fullDescription,
    descriptionParagraphs: fallback.descriptionParagraphs,
    shortDescription: service?.shortDescription ?? fallback.shortDescription,
    image: service?.image,
  };
}

/**
 * Every service, for the homepage grid. An empty CMS answer is a CMS with
 * nothing to say, so it falls back the same way an unreachable one does.
 */
export async function getServices(): Promise<Service[]> {
  const services = await fetchOrNull<Service[]>(servicesQuery);
  return services?.length ? services : fallbackServices;
}

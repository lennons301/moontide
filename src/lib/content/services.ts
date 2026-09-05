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
 *
 * Read by the root layout, which wraps every route — including `/book`,
 * which has no dependency of its own on either the CMS or this table. So a
 * Postgres outage or a cold-start blip must cost the catalogue's own answer
 * (no classes to list) and nothing else, the same guarantee `fetchOrNull`
 * gives every Sanity read: an uncaught throw here once took the whole site
 * down over an optional Instagram link, and this is the same shape of
 * mistake with a different dependency.
 */
export async function getClassCatalogue(): Promise<CatalogueClass[]> {
  try {
    return await db
      .select({
        slug: classes.slug,
        title: classes.title,
        category: classes.category,
      })
      .from(classes)
      .where(eq(classes.active, true))
      .orderBy(classes.id);
  } catch {
    return [];
  }
}

/**
 * The service slugs the catalogue never answers for — they have no row in
 * `classes` and never will, so `getService` has no reason to ask Postgres
 * about them at all.
 */
const NON_CLASS_SLUGS: ReadonlySet<string> = new Set([
  "coaching",
  "community",
  "private",
]);

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
    NON_CLASS_SLUGS.has(slug)
      ? Promise.resolve<CatalogueClass[]>([])
      : getClassCatalogue(),
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

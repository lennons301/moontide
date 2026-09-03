import type { Image, PortableTextBlock } from "sanity";
import { serviceBySlugQuery, servicesQuery } from "@/lib/sanity/queries";
import type { Service } from "@/lib/sanity/types";
import {
  fallbackServiceBySlug,
  fallbackServices,
  unknownServiceFallback,
} from "./fallbacks";
import { fetchOrNull } from "./source";

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
 */
export async function getService(slug: string): Promise<ServiceContent> {
  const service = await fetchOrNull<Service>(serviceBySlugQuery, { slug });
  const fallback = fallbackServiceBySlug[slug] ?? unknownServiceFallback;

  return {
    slug,
    title: service?.title ?? fallback.title,
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

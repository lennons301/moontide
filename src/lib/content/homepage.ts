import type { Service } from "@/lib/sanity/types";
import {
  type CatalogueClass,
  getClassCatalogue,
  getServices,
} from "./services";
import { getSiteSettings } from "./site-settings";
import { getTrainer, type TrainerContent } from "./trainer";

/**
 * The homepage's three CMS-backed sections, each asked for as a content
 * question of its own so one failing query (or one empty document) degrades
 * that section alone.
 */
export interface HomepageContent {
  /** Undefined leaves the Hero on its own hardcoded tagline. */
  heroTagline: string | undefined;
  services: Service[];
  /** For the class tiles to link by `sanityId` rather than by Sanity's slug. */
  catalogue: CatalogueClass[];
  trainer: TrainerContent;
}

export async function loadHomepageContent(): Promise<HomepageContent> {
  const [services, catalogue, trainer, siteSettings] = await Promise.all([
    getServices(),
    getClassCatalogue(),
    getTrainer(),
    getSiteSettings(),
  ]);

  return {
    heroTagline: siteSettings.heroTagline,
    services,
    catalogue,
    trainer,
  };
}

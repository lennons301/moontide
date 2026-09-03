import type { Service } from "@/lib/sanity/types";
import { getServices } from "./services";
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
  trainer: TrainerContent;
}

export async function loadHomepageContent(): Promise<HomepageContent> {
  const [services, trainer, siteSettings] = await Promise.all([
    getServices(),
    getTrainer(),
    getSiteSettings(),
  ]);

  return {
    heroTagline: siteSettings.heroTagline,
    services,
    trainer,
  };
}

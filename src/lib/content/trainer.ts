import type { Image, PortableTextBlock } from "sanity";
import { trainerQuery } from "@/lib/sanity/queries";
import type { Trainer } from "@/lib/sanity/types";
import { fallbackTrainer } from "./fallbacks";
import { fetchOrNull } from "./source";

/** Gabrielle, answered whether or not the CMS is reachable. */
export interface TrainerContent {
  name: string;
  shortBio: string;
  /**
   * Portable Text from the CMS. Absent when the CMS has no bio, in which case
   * `bioParagraphs` is what the page renders.
   */
  bio: PortableTextBlock[] | undefined;
  /** Never empty — the module's own bio. */
  bioParagraphs: string[];
  qualifications: { year: string; description: string }[];
  /** Absent when the CMS is unreachable or holds no photo. */
  photo: Image | undefined;
  /** Absent when the CMS is unreachable or holds no hero image. */
  heroImage: Image | undefined;
}

/**
 * The trainer document, read once and fallen back to once. The homepage reads
 * the name, short bio and photo; `/about` reads the bio and qualifications —
 * they used to fetch the same document with two unrelated sets of fallbacks.
 */
export async function getTrainer(): Promise<TrainerContent> {
  const trainer = await fetchOrNull<Trainer>(trainerQuery);

  return {
    name: trainer?.name ?? fallbackTrainer.name,
    shortBio: trainer?.shortBio ?? fallbackTrainer.shortBio,
    bio: trainer?.bio,
    bioParagraphs: fallbackTrainer.bioParagraphs,
    qualifications: trainer?.qualifications?.length
      ? trainer.qualifications
      : fallbackTrainer.qualifications,
    photo: trainer?.photo,
    heroImage: trainer?.heroImage,
  };
}

import {
  communityEventsQuery,
  serviceBySlugQuery,
  servicesQuery,
  siteSettingsQuery,
  trainerQuery,
} from "@/lib/sanity/queries";
import type {
  CommunityEvent,
  Service,
  SiteSettings,
  Trainer,
} from "@/lib/sanity/types";
import type { ContentSource } from "./source";

/**
 * The second adapter: a CMS held in a variable.
 *
 * Tests hand it documents and it answers the same GROQ queries the live source
 * does, which is what makes the seam real rather than a shape nothing else
 * implements. An `Error` in place of a document is that document's read
 * failing — the way a partial outage looks from inside the content module.
 */
export interface ContentDocuments {
  siteSettings?: SiteSettings | Error | null;
  /** Answers both the services grid and every service-by-slug read. */
  services?: Service[] | Error | null;
  trainer?: Trainer | Error | null;
  communityEvents?: CommunityEvent[] | Error | null;
}

function answer<T>(document: T | Error | null | undefined): T | null {
  if (document instanceof Error) throw document;
  return document ?? null;
}

export function inMemoryContentSource(
  documents: ContentDocuments = {},
): ContentSource {
  return {
    async fetch(query: string, params?: Record<string, string>) {
      if (query === siteSettingsQuery) {
        return answer(documents.siteSettings);
      }
      if (query === servicesQuery) {
        return answer(documents.services);
      }
      if (query === serviceBySlugQuery) {
        const services = answer(documents.services) ?? [];
        return services.find((s) => s.slug.current === params?.slug) ?? null;
      }
      if (query === trainerQuery) {
        return answer(documents.trainer);
      }
      if (query === communityEventsQuery) {
        return answer(documents.communityEvents);
      }
      // A query this adapter has not been taught. Throwing keeps a new query
      // from quietly reading as "the CMS has nothing" in every test.
      throw new Error(`in-memory content source: unknown query\n${query}`);
    },
  };
}

/** Sanity is down: every read fails, as it does in an outage. */
export const unreachableContentSource: ContentSource = {
  fetch() {
    return Promise.reject(new Error("ENOTFOUND api.sanity.io"));
  },
};

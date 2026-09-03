import { sanityClient } from "@/lib/sanity/client";

/**
 * Where editorial content comes from.
 *
 * Every read in `src/lib/content/` goes through a `ContentSource`, and nothing
 * outside this directory names a GROQ query or touches the Sanity client. Two
 * adapters implement it: `sanityContentSource` below, and the in-memory one in
 * `./in-memory-source` that the tests answer with documents instead of a
 * network. A source is free to throw — `fetchOrNull` is where a throw becomes
 * "the CMS has nothing to say", which is the same thing every caller already
 * has hardcoded content for.
 */
export interface ContentSource {
  /** The document, or nothing. The shape is the asking function's business. */
  fetch(query: string, params?: Record<string, string>): Promise<unknown>;
}

/** The live adapter: Sanity, over the network. */
export const sanityContentSource: ContentSource = {
  fetch: (query, params) => sanityClient.fetch(query, params),
};

let activeSource: ContentSource = sanityContentSource;

/**
 * Swap the adapter. Tests only — production never calls this, so the live
 * source is what every render reads.
 */
export function setContentSource(source: ContentSource): void {
  activeSource = source;
}

/** Back to Sanity. Tests call this when they are done. */
export function resetContentSource(): void {
  activeSource = sanityContentSource;
}

/**
 * One read, degraded to `null` on any failure.
 *
 * This is the whole reason the content module exists: a Sanity outage must
 * cost the content it was asked for and nothing else, and it must cost it in
 * one place rather than in a `try/catch` each page remembers to write.
 */
export async function fetchOrNull<T>(
  query: string,
  params?: Record<string, string>,
): Promise<T | null> {
  try {
    return ((await activeSource.fetch(query, params)) as T | null) ?? null;
  } catch {
    // CMS unreachable — the caller falls back to hardcoded content
    return null;
  }
}

import type { Image } from "sanity";
import {
  type ContentDocuments,
  inMemoryContentSource,
  unreachableContentSource,
} from "@/lib/content/in-memory-source";
import { resetContentSource, setContentSource } from "@/lib/content/source";

/**
 * What the CMS holds, for the duration of one test.
 *
 * `src/lib/content/` reads through a `ContentSource`, so a test says what the
 * CMS knows — or that it cannot be reached — instead of stubbing query strings.
 * Pair either with `afterEach(resetContentSource)`.
 */
export function givenCmsHolds(documents: ContentDocuments): void {
  setContentSource(inMemoryContentSource(documents));
}

/** Sanity is down. Every read fails, and every page must still render. */
export function givenCmsUnreachable(): void {
  setContentSource(unreachableContentSource);
}

export { resetContentSource };

/** A published image, for documents that carry one. */
export const CMS_IMAGE = {
  _type: "image",
  asset: { _ref: "image-abc", _type: "reference" },
} as unknown as Image;

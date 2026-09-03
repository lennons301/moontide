import { vi } from "vitest";

/**
 * The Sanity client module, stubbed.
 *
 * `@/lib/sanity/client` builds a real client the moment it is imported, so any
 * test that renders a page or touches `src/lib/content/` has to stand in for
 * it:
 *
 * ```ts
 * vi.mock("@/lib/sanity/client", async () =>
 *   (await import("../support/sanity-client")).sanityModuleMock,
 * );
 * ```
 *
 * Content itself does not come from here — tests answer with documents through
 * a `ContentSource` (see `../support/content`). `fetch` throwing is the point:
 * a test that forgot to install one fails loudly instead of quietly reaching
 * for the network.
 *
 * This module deliberately imports nothing from `src/`: it is evaluated while
 * `@/lib/sanity/client` is being mocked, and anything reaching back into that
 * module would be waiting on itself.
 */
export const IMAGE_URL = "https://cdn.test/image.jpg";

export const sanityModuleMock = {
  sanityClient: {
    fetch: vi.fn(() => {
      throw new Error(
        "a test read Sanity directly — install a content source instead",
      );
    }),
  },
  // Every caller chains .width().height().url(); the size does not matter here.
  urlFor: () => ({
    width: () => ({ height: () => ({ url: () => IMAGE_URL }) }),
  }),
};

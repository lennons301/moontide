import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import {
  fallbackServices,
  fallbackTrainerName,
  fallbackTrainerShortBio,
  loadHomepageContent,
} from "@/lib/content/homepage";
import { sanityClient } from "@/lib/sanity/client";
import {
  servicesQuery,
  siteSettingsQuery,
  trainerQuery,
} from "@/lib/sanity/queries";
import type { Service, SiteSettings, Trainer } from "@/lib/sanity/types";

vi.mock("@/lib/sanity/client", () => ({
  sanityClient: { fetch: vi.fn() },
}));

// `fetch` is heavily overloaded; the homepage only ever calls the query form.
const fetchMock = sanityClient.fetch as unknown as Mock<
  (query: string) => Promise<unknown>
>;

const CMS_SERVICES: Service[] = [
  {
    _id: "service-prenatal",
    title: "Prenatal Yoga",
    slug: { current: "prenatal" },
    category: "class",
    bookingType: "stripe",
  },
];

const CMS_TRAINER: Trainer = {
  _id: "trainer",
  name: "Gabrielle Waring",
  shortBio: "Yoga teacher, coach, and mother.",
};

const CMS_SITE_SETTINGS: SiteSettings = {
  title: "Moontide",
  heroTagline: "the pull of the moon",
  contactEmail: "hello@example.com",
};

/** Answer each of the three homepage queries with whatever `answers` holds. */
function respondWith(answers: {
  services?: unknown;
  trainer?: unknown;
  siteSettings?: unknown;
}) {
  fetchMock.mockImplementation(async (query: string) => {
    if (query === servicesQuery) {
      if (answers.services instanceof Error) throw answers.services;
      return answers.services ?? null;
    }
    if (query === trainerQuery) {
      if (answers.trainer instanceof Error) throw answers.trainer;
      return answers.trainer ?? null;
    }
    if (query === siteSettingsQuery) {
      if (answers.siteSettings instanceof Error) throw answers.siteSettings;
      return answers.siteSettings ?? null;
    }
    throw new Error(`unexpected query: ${query}`);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("loadHomepageContent", () => {
  it("uses CMS content when Sanity answers", async () => {
    respondWith({
      services: CMS_SERVICES,
      trainer: CMS_TRAINER,
      siteSettings: CMS_SITE_SETTINGS,
    });

    const content = await loadHomepageContent();

    expect(content.heroTagline).toBe("the pull of the moon");
    expect(content.services).toEqual(CMS_SERVICES);
    expect(content.trainer.name).toBe("Gabrielle Waring");
    expect(content.trainer.shortBio).toBe("Yoga teacher, coach, and mother.");
  });

  it("falls back for every section when the CMS is unreachable", async () => {
    respondWith({
      services: new Error("ENOTFOUND api.sanity.io"),
      trainer: new Error("ENOTFOUND api.sanity.io"),
      siteSettings: new Error("ENOTFOUND api.sanity.io"),
    });

    const content = await loadHomepageContent();

    // Undefined leaves the Hero on its own hardcoded tagline.
    expect(content.heroTagline).toBeUndefined();
    expect(content.services).toEqual(fallbackServices);
    expect(content.services.some((s) => s.category === "class")).toBe(true);
    expect(content.trainer.name).toBe(fallbackTrainerName);
    expect(content.trainer.shortBio).toBe(fallbackTrainerShortBio);
    expect(content.trainer.photo).toBeUndefined();
  });

  it("does not let one failing query take out the others", async () => {
    respondWith({
      services: new Error("query failed"),
      trainer: CMS_TRAINER,
      siteSettings: CMS_SITE_SETTINGS,
    });

    const content = await loadHomepageContent();

    expect(content.services).toEqual(fallbackServices);
    expect(content.trainer.name).toBe("Gabrielle Waring");
    expect(content.heroTagline).toBe("the pull of the moon");
  });

  it("keeps CMS services when only the trainer query fails", async () => {
    respondWith({
      services: CMS_SERVICES,
      trainer: new Error("query failed"),
      siteSettings: CMS_SITE_SETTINGS,
    });

    const content = await loadHomepageContent();

    expect(content.services).toEqual(CMS_SERVICES);
    expect(content.trainer.name).toBe(fallbackTrainerName);
    expect(content.heroTagline).toBe("the pull of the moon");
  });

  it("falls back when the CMS answers with nothing", async () => {
    respondWith({ services: [], trainer: null, siteSettings: null });

    const content = await loadHomepageContent();

    expect(content.services).toEqual(fallbackServices);
    expect(content.trainer.name).toBe(fallbackTrainerName);
    expect(content.heroTagline).toBeUndefined();
  });

  it("fills in a missing short bio for a trainer the CMS does have", async () => {
    respondWith({
      services: CMS_SERVICES,
      trainer: { _id: "trainer", name: "Gabrielle Waring" },
      siteSettings: CMS_SITE_SETTINGS,
    });

    const content = await loadHomepageContent();

    expect(content.trainer.name).toBe("Gabrielle Waring");
    expect(content.trainer.shortBio).toBe(fallbackTrainerShortBio);
  });
});

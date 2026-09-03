import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackServices, fallbackTrainer } from "@/lib/content/fallbacks";
import { loadHomepageContent } from "@/lib/content/homepage";
import type { Service, SiteSettings, Trainer } from "@/lib/sanity/types";
import {
  givenCmsHolds,
  givenCmsUnreachable,
  resetContentSource,
} from "../support/content";

vi.mock(
  "@/lib/sanity/client",
  async () => (await import("../support/sanity-client")).sanityModuleMock,
);

afterEach(resetContentSource);

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

describe("loadHomepageContent", () => {
  it("uses CMS content when Sanity answers", async () => {
    givenCmsHolds({
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
    givenCmsUnreachable();

    const content = await loadHomepageContent();

    // Undefined leaves the Hero on its own hardcoded tagline.
    expect(content.heroTagline).toBeUndefined();
    expect(content.services).toEqual(fallbackServices);
    expect(content.services.some((s) => s.category === "class")).toBe(true);
    expect(content.trainer.name).toBe(fallbackTrainer.name);
    expect(content.trainer.shortBio).toBe(fallbackTrainer.shortBio);
    expect(content.trainer.photo).toBeUndefined();
  });

  it("does not let one failing query take out the others", async () => {
    givenCmsHolds({
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
    givenCmsHolds({
      services: CMS_SERVICES,
      trainer: new Error("query failed"),
      siteSettings: CMS_SITE_SETTINGS,
    });

    const content = await loadHomepageContent();

    expect(content.services).toEqual(CMS_SERVICES);
    expect(content.trainer.name).toBe(fallbackTrainer.name);
    expect(content.heroTagline).toBe("the pull of the moon");
  });

  it("falls back when the CMS answers with nothing", async () => {
    givenCmsHolds({ services: [], trainer: null, siteSettings: null });

    const content = await loadHomepageContent();

    expect(content.services).toEqual(fallbackServices);
    expect(content.trainer.name).toBe(fallbackTrainer.name);
    expect(content.heroTagline).toBeUndefined();
  });

  it("fills in a missing short bio for a trainer the CMS does have", async () => {
    givenCmsHolds({
      services: CMS_SERVICES,
      trainer: { _id: "trainer", name: "Gabrielle Waring" },
      siteSettings: CMS_SITE_SETTINGS,
    });

    const content = await loadHomepageContent();

    expect(content.trainer.name).toBe("Gabrielle Waring");
    expect(content.trainer.shortBio).toBe(fallbackTrainer.shortBio);
  });

  it("shares the trainer fallback with /about", async () => {
    // One document, one fallback: the qualifications /about renders come from
    // the same object as the name and short bio the homepage renders.
    givenCmsUnreachable();

    const content = await loadHomepageContent();

    expect(content.trainer.qualifications).toEqual(
      fallbackTrainer.qualifications,
    );
    expect(content.trainer.bioParagraphs).toEqual(
      fallbackTrainer.bioParagraphs,
    );
  });
});

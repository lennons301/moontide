import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCommunityEvents } from "@/lib/content/community";
import {
  fallbackServices,
  fallbackTrainer,
  unknownServiceFallback,
} from "@/lib/content/fallbacks";
import {
  getClassCatalogue,
  getService,
  getServices,
} from "@/lib/content/services";
import { getSiteSettings } from "@/lib/content/site-settings";
import { getTrainer } from "@/lib/content/trainer";
import type { Service, Trainer } from "@/lib/sanity/types";
import {
  givenClassCatalogueHolds,
  givenClassCatalogueIsEmpty,
  givenClassCatalogueUnreachable,
  mockSelect,
} from "../support/classes";
import {
  CMS_IMAGE,
  givenCmsHolds,
  givenCmsUnreachable,
  resetContentSource,
} from "../support/content";

vi.mock(
  "@/lib/sanity/client",
  async () => (await import("../support/sanity-client")).sanityModuleMock,
);

vi.mock(
  "@/lib/db",
  async () => (await import("../support/classes")).dbModuleMock,
);

beforeEach(givenClassCatalogueIsEmpty);
afterEach(resetContentSource);

const CMS_COACHING: Service = {
  _id: "service-coaching",
  title: "Coaching (CMS)",
  slug: { current: "coaching" },
  shortDescription: "One-to-one work.",
  fullDescription: [
    {
      _type: "block",
      _key: "b1",
      children: [
        { _type: "span", _key: "s1", text: "Coaching, as published." },
      ],
    },
  ],
  image: CMS_IMAGE,
  category: "coaching",
  bookingType: "contact",
};

const CMS_TRAINER: Trainer = {
  _id: "trainer",
  name: "Gabrielle Waring",
  shortBio: "Yoga teacher, coach, and mother.",
  bio: [
    {
      _type: "block",
      _key: "b1",
      children: [{ _type: "span", _key: "s1", text: "As published." }],
    },
  ],
  photo: CMS_IMAGE,
  qualifications: [{ year: "2025", description: "Something new" }],
};

describe("getService", () => {
  it("answers with the CMS document when there is one", async () => {
    givenCmsHolds({ services: [CMS_COACHING] });

    const service = await getService("coaching");

    expect(service.title).toBe("Coaching (CMS)");
    expect(service.fullDescription).toEqual(CMS_COACHING.fullDescription);
    expect(service.shortDescription).toBe("One-to-one work.");
    expect(service.image).toEqual(CMS_IMAGE);
  });

  it("falls back when the CMS is unreachable", async () => {
    givenCmsUnreachable();

    const service = await getService("coaching");

    expect(service.title).toBe("Transformational Coaching");
    expect(service.fullDescription).toBeUndefined();
    expect(service.descriptionParagraphs).toHaveLength(3);
    expect(service.descriptionParagraphs[0]).toContain(
      "Life is full of transitions",
    );
    expect(service.image).toBeUndefined();
  });

  it("falls back when the CMS has no document for that slug", async () => {
    givenCmsHolds({ services: [CMS_COACHING] });

    const service = await getService("prenatal");

    expect(service.title).toBe("Prenatal Yoga");
    expect(service.descriptionParagraphs[0]).toContain("Gentle movement");
  });

  it("carries the fallback copy even when the CMS answers", async () => {
    // The page decides which to render; the fallback is always in the answer.
    givenCmsHolds({ services: [CMS_COACHING] });

    const service = await getService("coaching");

    expect(service.descriptionParagraphs[0]).toContain(
      "Life is full of transitions",
    );
  });

  it("has something to say about a slug nothing knows", async () => {
    givenCmsUnreachable();

    const service = await getService("moon-bathing");

    expect(service.title).toBe(unknownServiceFallback.title);
    expect(service.descriptionParagraphs).toEqual(
      unknownServiceFallback.descriptionParagraphs,
    );
  });

  it("gives every service page copy to fall back on", async () => {
    givenCmsUnreachable();

    for (const slug of [
      "prenatal",
      "postnatal",
      "baby-yoga",
      "vinyasa",
      "coaching",
      "community",
      "private",
    ]) {
      const service = await getService(slug);
      expect(service.title).not.toBe(unknownServiceFallback.title);
      expect(service.descriptionParagraphs.length).toBeGreaterThan(0);
    }
  });

  it("titles a catalogue class from Postgres, even when Sanity names it differently", async () => {
    givenClassCatalogueHolds([
      { slug: "prenatal", title: "Prenatal Yoga", category: "class" },
    ]);
    givenCmsHolds({
      services: [
        { ...CMS_COACHING, slug: { current: "prenatal" }, title: "Renamed" },
      ],
    });

    const service = await getService("prenatal");

    expect(service.title).toBe("Prenatal Yoga");
  });

  it("still renders Sanity's prose and image for a catalogue class", async () => {
    givenClassCatalogueHolds([
      { slug: "prenatal", title: "Prenatal Yoga", category: "class" },
    ]);
    givenCmsHolds({
      services: [{ ...CMS_COACHING, slug: { current: "prenatal" } }],
    });

    const service = await getService("prenatal");

    expect(service.title).toBe("Prenatal Yoga");
    expect(service.fullDescription).toEqual(CMS_COACHING.fullDescription);
    expect(service.image).toEqual(CMS_IMAGE);
  });

  it("falls back to 'coming soon' for a catalogue class Sanity has no document for", async () => {
    givenClassCatalogueHolds([
      { slug: "evening-flow", title: "Evening Flow", category: "class" },
    ]);
    givenCmsUnreachable();

    const service = await getService("evening-flow");

    expect(service.title).toBe("Evening Flow");
    expect(service.descriptionParagraphs).toEqual(
      unknownServiceFallback.descriptionParagraphs,
    );
  });

  it("falls back to the module's own copy when Postgres cannot be reached", async () => {
    givenClassCatalogueUnreachable();
    givenCmsUnreachable();

    const service = await getService("prenatal");

    expect(service.title).toBe("Prenatal Yoga");
    expect(service.descriptionParagraphs[0]).toContain("Gentle movement");
  });

  it("never asks Postgres about coaching, community or private", async () => {
    givenCmsUnreachable();
    mockSelect.mockClear();

    for (const slug of ["coaching", "community", "private"]) {
      const service = await getService(slug);
      expect(service.title).not.toBe(unknownServiceFallback.title);
    }

    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe("getClassCatalogue", () => {
  it("answers with the active classes Postgres holds", async () => {
    givenClassCatalogueHolds([
      { slug: "prenatal", title: "Prenatal Yoga", category: "class" },
      { slug: "postnatal", title: "Postnatal Yoga", category: "class" },
    ]);

    expect(await getClassCatalogue()).toEqual([
      { slug: "prenatal", title: "Prenatal Yoga", category: "class" },
      { slug: "postnatal", title: "Postnatal Yoga", category: "class" },
    ]);
  });

  it("answers with nothing when Postgres has no active classes", async () => {
    givenClassCatalogueIsEmpty();

    expect(await getClassCatalogue()).toEqual([]);
  });

  it("degrades to nothing rather than throw when Postgres cannot be reached", async () => {
    givenClassCatalogueUnreachable();

    await expect(getClassCatalogue()).resolves.toEqual([]);
  });
});

describe("getServices", () => {
  it("answers with the CMS list when there is one", async () => {
    givenCmsHolds({ services: [CMS_COACHING] });

    expect(await getServices()).toEqual([CMS_COACHING]);
  });

  it("falls back when the CMS is unreachable", async () => {
    givenCmsUnreachable();

    expect(await getServices()).toEqual(fallbackServices);
  });

  it("falls back when the CMS holds no services at all", async () => {
    givenCmsHolds({ services: [] });

    expect(await getServices()).toEqual(fallbackServices);
  });

  it("orders the fallback the way the CMS would have", async () => {
    givenCmsUnreachable();

    const slugs = (await getServices()).map((s) => s.slug.current);

    expect(slugs).toEqual([
      "prenatal",
      "postnatal",
      "baby-yoga",
      "vinyasa",
      "coaching",
      "community",
      "private",
    ]);
  });
});

describe("getTrainer", () => {
  it("answers with the CMS document when there is one", async () => {
    givenCmsHolds({ trainer: CMS_TRAINER });

    const trainer = await getTrainer();

    expect(trainer.name).toBe("Gabrielle Waring");
    expect(trainer.shortBio).toBe("Yoga teacher, coach, and mother.");
    expect(trainer.bio).toEqual(CMS_TRAINER.bio);
    expect(trainer.qualifications).toEqual(CMS_TRAINER.qualifications);
    expect(trainer.photo).toEqual(CMS_IMAGE);
  });

  it("falls back to one story about Gabrielle when the CMS is unreachable", async () => {
    givenCmsUnreachable();

    const trainer = await getTrainer();

    expect(trainer.name).toBe(fallbackTrainer.name);
    expect(trainer.shortBio).toBe(fallbackTrainer.shortBio);
    expect(trainer.bio).toBeUndefined();
    expect(trainer.bioParagraphs).toEqual(fallbackTrainer.bioParagraphs);
    expect(trainer.qualifications).toEqual(fallbackTrainer.qualifications);
    expect(trainer.photo).toBeUndefined();
    expect(trainer.heroImage).toBeUndefined();
  });

  it("fills in only the fields the CMS is missing", async () => {
    givenCmsHolds({ trainer: { _id: "trainer", name: "Gabrielle Waring" } });

    const trainer = await getTrainer();

    expect(trainer.name).toBe("Gabrielle Waring");
    expect(trainer.shortBio).toBe(fallbackTrainer.shortBio);
    expect(trainer.qualifications).toEqual(fallbackTrainer.qualifications);
  });
});

describe("getCommunityEvents", () => {
  it("answers with the published gatherings", async () => {
    const events = [{ _id: "e1", title: "Winter Solstice Circle" }];
    givenCmsHolds({ communityEvents: events });

    expect(await getCommunityEvents()).toEqual(events);
  });

  it("has no dates when the CMS is unreachable", async () => {
    givenCmsUnreachable();

    expect(await getCommunityEvents()).toEqual([]);
  });
});

describe("getSiteSettings", () => {
  it("answers with what the CMS holds", async () => {
    givenCmsHolds({
      siteSettings: {
        title: "Moontide",
        contactEmail: "hello@example.com",
        heroTagline: "Light moving across water",
        instagramUrl: "https://instagram.com/moontide",
      },
    });

    expect(await getSiteSettings()).toEqual({
      heroTagline: "Light moving across water",
      instagramUrl: "https://instagram.com/moontide",
    });
  });

  it("answers with neither when the CMS is unreachable", async () => {
    givenCmsUnreachable();

    expect(await getSiteSettings()).toEqual({
      heroTagline: undefined,
      instagramUrl: undefined,
    });
  });
});

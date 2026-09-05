import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Service } from "@/lib/sanity/types";
import {
  givenClassCatalogueHolds,
  givenClassCatalogueIsEmpty,
  givenClassCatalogueUnreachable,
} from "../support/classes";
import {
  CMS_IMAGE,
  givenCmsHolds,
  givenCmsUnreachable,
  resetContentSource,
} from "../support/content";
import { IMAGE_URL } from "../support/sanity-client";

vi.mock(
  "@/lib/sanity/client",
  async () => (await import("../support/sanity-client")).sanityModuleMock,
);

vi.mock(
  "@/lib/db",
  async () => (await import("../support/classes")).dbModuleMock,
);

/** The four bookable classes, as Postgres — the catalogue's owner — has them. */
const CATALOGUE = [
  { slug: "prenatal", title: "Prenatal Yoga", category: "class" as const },
  { slug: "postnatal", title: "Postnatal Yoga", category: "class" as const },
  {
    slug: "baby-yoga",
    title: "Baby Yoga & Massage",
    category: "class" as const,
  },
  {
    slug: "vinyasa",
    title: "Autumn Equinox Yin",
    category: "class" as const,
  },
];

beforeEach(() => givenClassCatalogueHolds(CATALOGUE));
afterEach(() => {
  resetContentSource();
  givenClassCatalogueIsEmpty();
});

/** next/image URL-encodes the src it was given. */
const encodedImageUrl = encodeURIComponent(IMAGE_URL);

async function renderPage(module: string) {
  const { default: Page } = await import(module);
  return renderToStaticMarkup(await Page({}));
}

async function renderClassPage(slug: string) {
  const { default: Page } = await import("@/app/classes/[slug]/page");
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ slug }) }),
  );
}

/** A published service, long copy and all. */
function published(slug: string, title: string): Service {
  return {
    _id: `service-${slug}`,
    title,
    slug: { current: slug },
    shortDescription: `${title}, in a line.`,
    fullDescription: [
      {
        _type: "block",
        _key: "b1",
        children: [{ _type: "span", _key: "s1", text: `${title}, published.` }],
      },
    ],
    image: CMS_IMAGE,
    category: "class",
    bookingType: "stripe",
  };
}

describe("with Sanity unreachable", () => {
  it("renders /about", async () => {
    givenCmsUnreachable();

    const html = await renderPage("@/app/about/page");

    expect(html).toContain("About Moontide");
    // The shared trainer fallback: bio and qualifications
    expect(html).toContain("Gabrielle");
    expect(html).toContain("200 hour Vinyasa Yoga Teacher Training, More Yoga");
    expect(html).toContain("Gabrielle&#x27;s Trainings");
    expect(html).not.toContain(encodedImageUrl);
  });

  it("renders /coaching", async () => {
    givenCmsUnreachable();

    const html = await renderPage("@/app/coaching/page");

    expect(html).toContain("Transformational Coaching");
    expect(html).toContain("Life is full of transitions");
    expect(html).toContain("tailored entirely to you");
    expect(html).toContain("/contact?subject=Transformational+Coaching");
  });

  it("renders /private", async () => {
    givenCmsUnreachable();

    const html = await renderPage("@/app/private/page");

    expect(html).toContain("Private Classes");
    expect(html).toContain("Everyone comes to the mat for different reasons");
    expect(html).toContain("/contact?subject=Private+Classes");
  });

  it("renders /community, dates and all", async () => {
    givenCmsUnreachable();

    const html = await renderPage("@/app/community/page");

    expect(html).toContain("Creating Community");
    expect(html).toContain("Connection is at the heart of everything I do");
    expect(html).toContain("all are welcome");
    // No published gatherings to show, so the page says so rather than throwing
    expect(html).toContain("coming soon");
  });

  it("renders every class page", async () => {
    givenCmsUnreachable();

    for (const [slug, title] of [
      ["prenatal", "Prenatal Yoga"],
      ["postnatal", "Postnatal Yoga"],
      ["baby-yoga", "Baby Yoga &amp; Massage"],
      ["vinyasa", "Autumn Equinox Yin"],
    ]) {
      const html = await renderClassPage(slug);
      expect(html, slug).toContain(title);
      expect(html, slug).toContain("Book a Class");
    }
  });

  it("still has something to show for a class it has never heard of", async () => {
    givenCmsUnreachable();

    const html = await renderClassPage("moon-bathing");

    expect(html).toContain("Class details coming soon.");
  });

  it("still renders a class page when Postgres cannot be reached, from the module's own copy", async () => {
    givenClassCatalogueUnreachable();
    givenCmsUnreachable();

    const html = await renderClassPage("prenatal");

    expect(html).toContain(">Prenatal Yoga<");
    expect(html).toContain("Gentle movement and breath work");
  });
});

describe("with Sanity answering", () => {
  it("renders the published coaching copy and image", async () => {
    givenCmsHolds({
      services: [published("coaching", "Coaching, renamed")],
    });

    const html = await renderPage("@/app/coaching/page");

    expect(html).toContain("Coaching, renamed, published.");
    expect(html).not.toContain("Life is full of transitions");
    expect(html).toContain(encodedImageUrl);
  });

  it("renders the published private copy", async () => {
    givenCmsHolds({ services: [published("private", "Private")] });

    const html = await renderPage("@/app/private/page");

    expect(html).toContain("Private, published.");
    expect(html).not.toContain("Everyone comes to the mat");
  });

  it("renders the published class prose, but titles the page from Postgres", async () => {
    // ADR-0001: Postgres owns a class's title, even when Sanity names it
    // differently — the two used to disagree, which is the drift this fixes.
    givenCmsHolds({ services: [published("prenatal", "Prenatal Yoga (CMS)")] });

    const html = await renderClassPage("prenatal");

    expect(html).toContain("<h1");
    expect(html).toContain(">Prenatal Yoga<");
    expect(html).toContain("Prenatal Yoga (CMS), published.");
  });

  it("titles a class page from Postgres, whatever the CMS says or whether it can be reached", async () => {
    const { generateMetadata } = await import("@/app/classes/[slug]/page");

    givenCmsHolds({ services: [published("prenatal", "Prenatal Yoga (CMS)")] });
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "prenatal" }) }),
    ).resolves.toEqual({ title: "Prenatal Yoga — Moontide" });

    givenCmsUnreachable();
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "prenatal" }) }),
    ).resolves.toEqual({ title: "Prenatal Yoga — Moontide" });
  });

  it("still renders a catalogue class with no matching Sanity doc: title correct, description coming soon", async () => {
    givenClassCatalogueHolds([
      ...CATALOGUE,
      { slug: "evening-flow", title: "Evening Flow", category: "class" },
    ]);
    givenCmsHolds({ services: [] });

    const html = await renderClassPage("evening-flow");

    expect(html).toContain("Evening Flow");
    expect(html).toContain("Class details coming soon.");
  });

  it("renders the published community gatherings", async () => {
    givenCmsHolds({
      services: [published("community", "Creating Community")],
      communityEvents: [
        {
          _id: "event-solstice",
          title: "Winter Solstice Circle",
          date: "2026-12-21",
          location: "Chichester",
          description: "An evening of stillness.",
        },
      ],
    });

    const html = await renderPage("@/app/community/page");

    expect(html).toContain("Winter Solstice Circle");
    expect(html).toContain("Monday, 21 December 2026");
    expect(html).toContain("Chichester");
    expect(html).not.toContain("coming soon");
  });

  it("renders the published bio and qualifications on /about", async () => {
    givenCmsHolds({
      trainer: {
        _id: "trainer",
        name: "Gabrielle Waring",
        bio: [
          {
            _type: "block",
            _key: "b1",
            children: [{ _type: "span", _key: "s1", text: "As published." }],
          },
        ],
        qualifications: [{ year: "2025", description: "Something new" }],
        photo: CMS_IMAGE,
        heroImage: CMS_IMAGE,
      },
    });

    const html = await renderPage("@/app/about/page");

    expect(html).toContain("As published.");
    expect(html).toContain("Something new");
    expect(html).not.toContain("More Yoga");
    expect(html).toContain(encodedImageUrl);
  });
});

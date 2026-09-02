import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(resetContentSource);

async function renderHomePage() {
  const { default: HomePage } = await import("@/app/page");
  return renderToStaticMarkup(await HomePage());
}

/** next/image URL-encodes the src it was given. */
const encodedImageUrl = encodeURIComponent(IMAGE_URL);

describe("HomePage", () => {
  it("renders fallback content when Sanity is unreachable", async () => {
    givenCmsUnreachable();

    const html = await renderHomePage();

    // Hero — its own hardcoded tagline
    expect(html).toContain("The pull of the moon on the tides");
    // Services grid — hardcoded classes, coaching, community and private
    expect(html).toContain("Prenatal Yoga");
    expect(html).toContain("Baby Yoga &amp; Massage");
    expect(html).toContain("Transformational Coaching");
    expect(html).toContain("Creating Community");
    expect(html).toContain("Private Classes");
    // About preview — still there, named, without a photo
    expect(html).toContain("Gabrielle");
    expect(html).not.toContain(encodedImageUrl);
  });

  it("renders CMS content when Sanity answers", async () => {
    givenCmsHolds({
      services: [
        {
          _id: "service-prenatal",
          title: "Prenatal Yoga (CMS)",
          slug: { current: "prenatal" },
          category: "class",
          bookingType: "stripe",
        },
      ],
      trainer: {
        _id: "trainer",
        name: "Gabrielle Waring",
        shortBio: "Yoga teacher, coach, and mother.",
        photo: CMS_IMAGE,
      },
      siteSettings: {
        title: "Moontide",
        contactEmail: "hello@example.com",
        heroTagline: "Light moving across water",
      },
    });

    const html = await renderHomePage();

    expect(html).toContain("Light moving across water");
    expect(html).toContain("Prenatal Yoga (CMS)");
    expect(html).toContain("Gabrielle Waring");
    expect(html).toContain("Yoga teacher, coach, and mother.");
    expect(html).toContain(encodedImageUrl);
  });

  it("degrades each section independently", async () => {
    givenCmsHolds({
      services: new Error("query failed"),
      trainer: {
        _id: "trainer",
        name: "Gabrielle Waring",
        shortBio: "Yoga teacher, coach, and mother.",
      },
      siteSettings: {
        title: "Moontide",
        contactEmail: "hello@example.com",
        heroTagline: "Light moving across water",
      },
    });

    const html = await renderHomePage();

    // Only the services grid falls back; the other two keep CMS content.
    expect(html).toContain("Prenatal Yoga");
    expect(html).toContain("Light moving across water");
    expect(html).toContain("Gabrielle Waring");
  });
});

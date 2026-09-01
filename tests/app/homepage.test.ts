import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { sanityClient } from "@/lib/sanity/client";
import {
  servicesQuery,
  siteSettingsQuery,
  trainerQuery,
} from "@/lib/sanity/queries";

vi.mock("@/lib/sanity/client", () => ({
  sanityClient: { fetch: vi.fn() },
  urlFor: () => ({
    width: () => ({ height: () => ({ url: () => "https://cdn/photo.jpg" }) }),
  }),
}));

// `fetch` is heavily overloaded; the homepage only ever calls the query form.
const fetchMock = sanityClient.fetch as unknown as Mock<
  (query: string) => Promise<unknown>
>;

/** Answer each homepage query with a value, or throw when given an Error. */
function respondWith(answers: Record<string, unknown>) {
  fetchMock.mockImplementation(async (query: string) => {
    const answer = answers[query];
    if (answer instanceof Error) throw answer;
    return answer ?? null;
  });
}

async function renderHomePage() {
  const { default: HomePage } = await import("@/app/page");
  return renderToStaticMarkup(await HomePage());
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("HomePage", () => {
  it("renders fallback content when every Sanity fetch fails", async () => {
    respondWith({
      [servicesQuery]: new Error("ENOTFOUND api.sanity.io"),
      [trainerQuery]: new Error("ENOTFOUND api.sanity.io"),
      [siteSettingsQuery]: new Error("ENOTFOUND api.sanity.io"),
    });

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
    // next/image URL-encodes the src it was given
    expect(html).not.toContain("cdn%2Fphoto.jpg");
  });

  it("renders CMS content when Sanity answers", async () => {
    respondWith({
      [servicesQuery]: [
        {
          _id: "service-prenatal",
          title: "Prenatal Yoga (CMS)",
          slug: { current: "prenatal" },
          category: "class",
          bookingType: "stripe",
        },
      ],
      [trainerQuery]: {
        _id: "trainer",
        name: "Gabrielle Waring",
        shortBio: "Yoga teacher, coach, and mother.",
        photo: { _type: "image", asset: { _ref: "image-abc", _type: "ref" } },
      },
      [siteSettingsQuery]: {
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
    expect(html).toContain("cdn%2Fphoto.jpg");
  });

  it("degrades each section independently", async () => {
    respondWith({
      [servicesQuery]: new Error("query failed"),
      [trainerQuery]: {
        _id: "trainer",
        name: "Gabrielle Waring",
        shortBio: "Yoga teacher, coach, and mother.",
      },
      [siteSettingsQuery]: {
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

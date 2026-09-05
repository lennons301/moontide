import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Footer } from "@/components/footer";
import { MobileMenu } from "@/components/mobile-menu";
import { givenClassCatalogueHolds } from "../support/classes";
import { givenCmsUnreachable, resetContentSource } from "../support/content";

vi.mock(
  "@/lib/sanity/client",
  async () => (await import("../support/sanity-client")).sanityModuleMock,
);

vi.mock(
  "@/lib/db",
  async () => (await import("../support/classes")).dbModuleMock,
);

/**
 * Nav, footer and `/about` each list the catalogue independently — the bug
 * this fixes was three different hardcoded enumerations that had already
 * drifted from each other and from Postgres. A class in the catalogue that
 * one of the three forgets to render is exactly that regression again, so
 * this asserts reachability for all three rather than trusting one render to
 * imply the others.
 */
const CATALOGUE = [
  { slug: "prenatal", title: "Prenatal Yoga", category: "class" as const },
  {
    slug: "baby-yoga",
    title: "Baby Yoga & Massage",
    category: "class" as const,
  },
  // Not one of the four classes hardcoded anywhere historically — proves the
  // three components read the catalogue rather than a list of known slugs.
  { slug: "evening-flow", title: "Evening Flow", category: "class" as const },
];

beforeEach(() => givenClassCatalogueHolds(CATALOGUE));
afterEach(() => {
  resetContentSource();
});

function expectReachable(html: string, where: string) {
  for (const { slug, title } of CATALOGUE) {
    expect(html, `${where} should link to /classes/${slug}`).toContain(
      `/classes/${slug}`,
    );
    expect(html, `${where} should name "${title}"`).toContain(
      title.replace(/&/g, "&amp;"),
    );
  }
}

describe("every catalogue class is reachable from navigation", () => {
  it("from the mobile menu", () => {
    render(<MobileMenu open={true} onClose={() => {}} classes={CATALOGUE} />);
    // The Classes section is collapsed by default.
    fireEvent.click(screen.getByRole("button", { name: /Classes/ }));

    for (const { slug, title } of CATALOGUE) {
      expect(
        screen.getByRole("link", { name: title }),
        `the mobile menu should link to /classes/${slug}`,
      ).toHaveAttribute("href", `/classes/${slug}`);
    }
  });

  it("from the footer", () => {
    const html = renderToStaticMarkup(<Footer classes={CATALOGUE} />);

    expectReachable(html, "the footer");
  });

  it("from /about", async () => {
    givenCmsUnreachable();
    const { default: AboutPage } = await import("@/app/about/page");
    const html = renderToStaticMarkup(await AboutPage());

    expectReachable(html, "/about");
  });
});

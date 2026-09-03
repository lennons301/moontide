import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  givenCmsHolds,
  givenCmsUnreachable,
  resetContentSource,
} from "../support/content";

vi.mock(
  "@/lib/sanity/client",
  async () => (await import("../support/sanity-client")).sanityModuleMock,
);

// next/font/google is a build-time loader; the layout only uses the variables.
vi.mock("next/font/google", () => {
  const loader = (options: { variable: string }) => ({
    variable: options.variable,
  });
  return {
    Cormorant_Garamond: loader,
    Playfair_Display: loader,
    Source_Sans_3: loader,
  };
});

afterEach(resetContentSource);

/** Render the layout around a stand-in page, the way every route does. */
async function renderLayout() {
  const { default: RootLayout } = await import("@/app/layout");
  return renderToStaticMarkup(
    await RootLayout({
      children: createElement("p", null, "Book a Class"),
    }),
  );
}

describe("RootLayout", () => {
  it("renders the site without an Instagram link when Sanity is unreachable", async () => {
    givenCmsUnreachable();

    const html = await renderLayout();

    // The page inside the layout still renders — /book has no Sanity
    // dependency of its own and must keep taking bookings through an outage.
    expect(html).toContain("Book a Class");
    // Footer is there, minus the one thing the CMS was asked for.
    expect(html).toContain("Privacy");
    expect(html).not.toContain("Instagram");
  });

  it("renders the site without an Instagram link when Sanity has no settings", async () => {
    givenCmsHolds({ siteSettings: null });

    const html = await renderLayout();

    expect(html).toContain("Book a Class");
    expect(html).not.toContain("Instagram");
  });

  it("shows the Instagram link when Sanity answers with one", async () => {
    givenCmsHolds({
      siteSettings: {
        title: "Moontide",
        contactEmail: "hello@example.com",
        instagramUrl: "https://instagram.com/moontide",
      },
    });

    const html = await renderLayout();

    expect(html).toContain("https://instagram.com/moontide");
    expect(html).toContain("Instagram");
  });
});

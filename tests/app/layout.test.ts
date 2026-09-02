import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { sanityClient } from "@/lib/sanity/client";
import { siteSettingsQuery } from "@/lib/sanity/queries";

vi.mock("@/lib/sanity/client", () => ({
  sanityClient: { fetch: vi.fn() },
}));

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

// `fetch` is heavily overloaded; the layout only ever calls the query form.
const fetchMock = sanityClient.fetch as unknown as Mock<
  (query: string) => Promise<unknown>
>;

/** Render the layout around a stand-in page, the way every route does. */
async function renderLayout() {
  const { default: RootLayout } = await import("@/app/layout");
  return renderToStaticMarkup(
    await RootLayout({
      children: createElement("p", null, "Book a Class"),
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("RootLayout", () => {
  it("renders the site without an Instagram link when Sanity throws", async () => {
    fetchMock.mockRejectedValue(new Error("ENOTFOUND api.sanity.io"));

    const html = await renderLayout();

    // The page inside the layout still renders — /book has no Sanity
    // dependency of its own and must keep taking bookings through an outage.
    expect(html).toContain("Book a Class");
    // Footer is there, minus the one thing the CMS was asked for.
    expect(html).toContain("Privacy");
    expect(html).not.toContain("Instagram");
  });

  it("renders the site without an Instagram link when Sanity has no settings", async () => {
    fetchMock.mockResolvedValue(null);

    const html = await renderLayout();

    expect(html).toContain("Book a Class");
    expect(html).not.toContain("Instagram");
  });

  it("shows the Instagram link when Sanity answers with one", async () => {
    fetchMock.mockResolvedValue({
      title: "Moontide",
      contactEmail: "hello@example.com",
      instagramUrl: "https://instagram.com/moontide",
    });

    const html = await renderLayout();

    expect(fetchMock).toHaveBeenCalledWith(siteSettingsQuery);
    expect(html).toContain("https://instagram.com/moontide");
    expect(html).toContain("Instagram");
  });
});

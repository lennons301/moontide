import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PricingPage from "@/app/admin/pricing/page";
import { type StubRoute, stubFetch } from "../../support/fetch-stub";

vi.mock("@/lib/admin/navigate", () => ({
  LOGIN_PATH: "/admin/login",
  goToLogin: vi.fn(),
}));

const PRICING = {
  bundleConfigs: [
    {
      id: 7,
      name: "Six-Class Bundle",
      priceInPence: 6600,
      credits: 6,
      expiryDays: 90,
      active: true,
      purchased: true,
    },
  ],
};

function stubPricing(save: StubRoute) {
  return stubFetch({
    "GET /api/admin/pricing": { json: PRICING },
    "PUT /api/admin/pricing": save,
  });
}

async function typeANewBundlePrice() {
  const price = await screen.findByDisplayValue("66.00");
  fireEvent.change(price, { target: { value: "72.00" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/admin/pricing", () => {
  it("leaves Save usable after a failure that is not JSON", async () => {
    // A 502 answers with HTML. Reading it as JSON threw out of handleSave
    // before `setSaving(false)`, and the button stayed disabled until reload.
    stubPricing({ status: 502, html: "<html>Bad gateway</html>" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PricingPage />);
    await typeANewBundlePrice();

    const save = screen.getByRole("button", { name: "Save Changes" });
    fireEvent.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong (502).",
    );
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled();
  });

  it("shows the server's refusal", async () => {
    stubPricing({
      status: 400,
      json: { error: "Bundle price must be greater than 0" },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PricingPage />);
    await typeANewBundlePrice();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bundle price must be greater than 0",
    );
  });

  it("reloads the prices after a save", async () => {
    const fetchMock = stubPricing({ json: { success: true } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PricingPage />);
    await typeANewBundlePrice();

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByDisplayValue("66.00");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => url === "/api/admin/pricing"),
    ).toHaveLength(3);
  });

  it("does not offer to delete a bundle that has been purchased", async () => {
    stubPricing({ json: { success: true } });
    render(<PricingPage />);

    await screen.findByText("Six-Class Bundle");
    expect(
      screen.queryByRole("button", { name: "Delete" }),
    ).not.toBeInTheDocument();
  });

  it("deletes a bundle that has never been purchased", async () => {
    const fetchMock = stubFetch({
      "GET /api/admin/pricing": {
        json: {
          bundleConfigs: [
            {
              id: 9,
              name: "Four-Class Bundle",
              priceInPence: 4400,
              credits: 4,
              expiryDays: 90,
              active: true,
              purchased: false,
            },
          ],
        },
      },
      "DELETE /api/admin/pricing": { json: { success: true } },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PricingPage />);

    await screen.findByText("Four-Class Bundle");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            url === "/api/admin/pricing" && init?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("toggles a bundle between active and inactive", async () => {
    const fetchMock = stubPricing({ json: { success: true } });
    render(<PricingPage />);

    await screen.findByText("Six-Class Bundle");
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/admin/pricing" && init?.method === "PUT",
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call?.[1]?.body as string) ?? "{}")).toEqual({
        bundleConfigs: [{ id: 7, active: false }],
      });
    });
  });

  it("creates a new bundle through the form", async () => {
    const fetchMock = stubFetch({
      "GET /api/admin/pricing": { json: PRICING },
      "POST /api/admin/pricing": { json: { success: true } },
    });
    render(<PricingPage />);

    await screen.findByText("Six-Class Bundle");
    fireEvent.click(screen.getByRole("button", { name: "New Bundle" }));

    const form = screen
      .getByRole("heading", { name: "Create Bundle" })
      .closest("form") as HTMLElement;

    fireEvent.change(within(form).getByLabelText("Name"), {
      target: { value: "4-Class Bundle" },
    });
    fireEvent.change(within(form).getByLabelText("Bundle Price"), {
      target: { value: "44.00" },
    });
    fireEvent.change(within(form).getByLabelText("Classes Included"), {
      target: { value: "4" },
    });
    fireEvent.change(within(form).getByLabelText("Expiry (days)"), {
      target: { value: "60" },
    });

    fireEvent.click(
      within(form).getByRole("button", { name: "Create Bundle" }),
    );

    await vi.waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === "/api/admin/pricing" && init?.method === "POST",
      );
      expect(call).toBeDefined();
      expect(JSON.parse((call?.[1]?.body as string) ?? "{}")).toEqual({
        name: "4-Class Bundle",
        priceInPence: 4400,
        credits: 4,
        expiryDays: 60,
      });
    });
  });
});

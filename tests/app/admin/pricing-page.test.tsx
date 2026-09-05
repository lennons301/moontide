import { fireEvent, render, screen } from "@testing-library/react";
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
});

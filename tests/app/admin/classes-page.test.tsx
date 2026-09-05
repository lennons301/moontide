import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClassesPage from "@/app/admin/classes/page";
import { stubFetch } from "../../support/fetch-stub";

vi.mock("@/lib/admin/navigate", () => ({
  LOGIN_PATH: "/admin/login",
  goToLogin: vi.fn(),
}));

const PRENATAL = {
  id: 4,
  slug: "prenatal-yoga",
  sanityId: null,
  category: "class",
  bookingType: "stripe",
  active: true,
  priceInPence: 1500,
  title: "Prenatal Yoga",
  bundleEligible: true,
};

function stubClasses(overrides: Record<string, unknown> = {}) {
  return stubFetch({
    "GET /api/admin/classes": { json: [PRENATAL] },
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/admin/classes", () => {
  it("creates a class from the form, slug included", async () => {
    const fetchMock = stubClasses({
      "POST /api/admin/classes": { status: 201, json: { id: 5 } },
    });
    render(<ClassesPage />);
    await screen.findByRole("cell", { name: "Prenatal Yoga" });

    fireEvent.click(screen.getByRole("button", { name: "New Class" }));
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Autumn Equinox Yin" },
    });
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "autumn-equinox-yin" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "18.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Class" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/classes",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const [, init] = fetchMock.mock.calls.find(
      ([, i]) => i?.method === "POST",
    ) as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      slug: "autumn-equinox-yin",
      title: "Autumn Equinox Yin",
      category: "class",
      bookingType: "stripe",
      priceInPence: 1800,
      active: true,
      bundleEligible: true,
    });
  });

  it("edits a class, slug included", async () => {
    const fetchMock = stubClasses({
      "PUT /api/admin/classes": { json: PRENATAL },
    });
    render(<ClassesPage />);
    await screen.findByRole("cell", { name: "Prenatal Yoga" });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    // The slug is an ordinary input now — renaming it is the point.
    fireEvent.change(screen.getByLabelText("Slug"), {
      target: { value: "prenatal-yoga-renamed" },
    });
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Prenatal Yoga (Updated)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/classes",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const [, init] = fetchMock.mock.calls.find(
      ([, i]) => i?.method === "PUT",
    ) as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.slug).toBe("prenatal-yoga-renamed");
    expect(body.title).toBe("Prenatal Yoga (Updated)");
  });

  it("deactivates and reactivates a class", async () => {
    const fetchMock = stubClasses({
      "PUT /api/admin/classes": { json: { ...PRENATAL, active: false } },
    });
    render(<ClassesPage />);
    await screen.findByRole("cell", { name: "Prenatal Yoga" });

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/classes",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ id: 4, active: false }),
        }),
      ),
    );
  });

  it("says on the page why a class could not be saved", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    stubClasses({
      "PUT /api/admin/classes": {
        status: 409,
        json: { error: "A class with this slug already exists" },
      },
    });
    render(<ClassesPage />);
    await screen.findByRole("cell", { name: "Prenatal Yoga" });

    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A class with this slug already exists",
    );
    expect(alert).not.toHaveBeenCalled();
  });
});

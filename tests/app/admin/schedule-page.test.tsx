import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SchedulePage from "@/app/admin/schedule/page";
import { goToLogin } from "@/lib/admin/navigate";
import { stubFetch } from "../../support/fetch-stub";

vi.mock("@/lib/admin/navigate", () => ({
  LOGIN_PATH: "/admin/login",
  goToLogin: vi.fn(),
}));

const CLASS = {
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

const SCHEDULE = {
  schedules: {
    id: 1,
    classId: 4,
    date: "2099-06-09",
    startTime: "09:30:00",
    endTime: "10:30:00",
    capacity: 8,
    bookedCount: 5,
    location: "Studio 1",
    recurringRule: null,
    status: "open",
  },
  classes: CLASS,
  waitlistCount: 0,
  heldCount: 0,
};

function stubSchedule(overrides: Record<string, unknown> = {}) {
  return stubFetch({
    "GET /api/admin/schedules": { json: [SCHEDULE] },
    "GET /api/admin/classes": { json: [CLASS] },
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(goToLogin).mockClear();
});

describe("/admin/schedule", () => {
  it("takes an expired session to the login page instead of throwing", async () => {
    // The proxy answers /api/admin/* with 401 {"error":"Unauthorized"}. That
    // object used to be set as the schedule list, and the next .map threw.
    stubSchedule({
      "GET /api/admin/schedules": {
        status: 401,
        json: { error: "Unauthorized" },
      },
    });
    render(<SchedulePage />);

    await waitFor(() => expect(goToLogin).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("heading", { name: "Schedule" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
  });

  it("says on the page why a class could not be cancelled, without an alert", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    stubSchedule({
      "PUT /api/admin/schedules": {
        status: 400,
        json: { error: "This class is already cancelled" },
      },
    });
    render(<SchedulePage />);
    await screen.findByRole("cell", { name: "Prenatal Yoga" });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This class is already cancelled",
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it("says why a schedule could not be deleted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    stubSchedule({
      "DELETE /api/admin/schedules": {
        status: 400,
        json: { error: "Cannot delete a schedule with bookings" },
      },
    });
    render(<SchedulePage />);
    await screen.findByRole("cell", { name: "Prenatal Yoga" });

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot delete a schedule with bookings",
    );
  });

  it("says why the form would not save, and re-enables the button", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    stubSchedule({
      "POST /api/admin/schedules": {
        status: 400,
        json: { error: "Capacity cannot be lower than the 5 seats booked" },
      },
    });
    render(<SchedulePage />);
    await screen.findByRole("cell", { name: "Prenatal Yoga" });

    fireEvent.click(screen.getByRole("button", { name: "New Class" }));
    fireEvent.change(screen.getByLabelText("Class Type"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2099-07-01" },
    });
    fireEvent.change(screen.getByLabelText("Start Time"), {
      target: { value: "09:30" },
    });
    fireEvent.change(screen.getByLabelText("End Time"), {
      target: { value: "10:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Schedule" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Capacity cannot be lower than the 5 seats booked",
    );
    expect(alert).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Create Schedule" }),
    ).toBeEnabled();
  });
});

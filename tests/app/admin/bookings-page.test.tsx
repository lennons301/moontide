import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookingsPage from "@/app/admin/bookings/page";
import { goToLogin } from "@/lib/admin/navigate";
import { stubFetch } from "../../support/fetch-stub";

vi.mock("@/lib/admin/navigate", () => ({
  LOGIN_PATH: "/admin/login",
  goToLogin: vi.fn(),
}));

const SCHEDULE = {
  id: 1,
  classId: 4,
  date: "2099-06-09",
  startTime: "09:30:00",
  endTime: "10:30:00",
  capacity: 8,
  bookedCount: 1,
  location: "Studio 1",
  recurringRule: null,
  status: "open",
};

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

const BOOKING = {
  bookings: {
    id: 11,
    scheduleId: 1,
    customerName: "Ada Fields",
    customerEmail: "ada@example.com",
    stripePaymentId: "pi_1",
    bundleId: null,
    status: "confirmed",
    createdAt: "2026-05-01T09:00:00.000Z",
    emailSent: true,
    originalScheduleId: null,
    rescheduledAt: null,
    releasedAt: null,
  },
  schedules: SCHEDULE,
  classes: CLASS,
};

function stubBookings(overrides: Record<string, unknown> = {}) {
  return stubFetch({
    "GET /api/admin/bookings": { json: [BOOKING] },
    "GET /api/admin/schedules": { json: [] },
    "GET /api/admin/classes": { json: [CLASS] },
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(goToLogin).mockClear();
});

describe("/admin/bookings", () => {
  it("shows the booking once it has loaded", async () => {
    stubBookings();
    render(<BookingsPage />);

    expect(await screen.findByText("Ada Fields")).toBeInTheDocument();
  });

  it("says why the server refused a cancellation", async () => {
    // The row not moving was the whole of the old answer: the mutation
    // discarded the response, so this sentence never reached anyone.
    stubBookings({
      "PUT /api/admin/bookings": {
        status: 400,
        json: { error: "Booking is already cancelled" },
      },
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BookingsPage />);
    await screen.findByText("Ada Fields");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Booking is already cancelled",
    );
  });

  it("says why a resend did not go out", async () => {
    stubBookings({
      "GET /api/admin/bookings": {
        json: [
          { ...BOOKING, bookings: { ...BOOKING.bookings, emailSent: false } },
        ],
      },
      "POST /api/admin/resend-email": {
        status: 404,
        json: { error: "Booking not found" },
      },
    });
    render(<BookingsPage />);

    fireEvent.click(
      await screen.findByRole("button", { name: "resend email" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Booking not found",
    );
  });

  it("shows the load failure in the table rather than an empty one", async () => {
    stubBookings({
      "GET /api/admin/bookings": {
        status: 503,
        json: { error: "Database is asleep" },
      },
    });
    render(<BookingsPage />);

    expect(await screen.findByText("Database is asleep")).toBeInTheDocument();
    expect(screen.queryByText(/No bookings/)).not.toBeInTheDocument();
  });

  it("goes to the login page when the session has expired", async () => {
    stubBookings({
      "GET /api/admin/bookings": {
        status: 401,
        json: { error: "Unauthorized" },
      },
    });
    render(<BookingsPage />);

    await waitFor(() => expect(goToLogin).toHaveBeenCalled());
    // And nothing threw: the page is still standing.
    expect(
      screen.getByRole("heading", { name: "Bookings" }),
    ).toBeInTheDocument();
  });
});

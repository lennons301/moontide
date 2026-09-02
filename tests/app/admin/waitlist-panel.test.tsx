import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WaitlistPanel } from "@/app/admin/schedule/waitlist-panel";
import { stubFetch } from "../../support/fetch-stub";

vi.mock("@/lib/admin/navigate", () => ({
  LOGIN_PATH: "/admin/login",
  goToLogin: vi.fn(),
}));

const WAITLIST = {
  entries: [
    {
      id: 21,
      scheduleId: 1,
      customerName: "Ada Fields",
      customerEmail: "ada@example.com",
      createdAt: "2026-05-01T09:00:00.000Z",
      offer: null,
    },
  ],
  occupancy: {
    capacity: 8,
    freeSeats: 1,
    offersOutstanding: 0,
    seatsWithNobodyOnThem: 1,
    canOffer: true,
  },
  scheduleStatus: "open",
};

function renderPanel() {
  return render(
    <WaitlistPanel
      open
      onOpenChange={() => {}}
      scheduleId={1}
      classTitle="Prenatal Yoga"
      date="2099-06-09"
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("WaitlistPanel", () => {
  it("says on the panel why an offer was refused, without an alert", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    stubFetch({
      "GET /api/admin/waitlist": { json: WAITLIST },
      "POST /api/admin/waitlist/offer": {
        status: 409,
        json: { error: "Every free seat already has an offer against it" },
      },
    });
    renderPanel();
    fireEvent.click(await screen.findByText("Offer the seat"));

    fireEvent.click(screen.getByText("Send offer"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Every free seat already has an offer against it",
    );
    expect(alert).not.toHaveBeenCalled();
  });

  it("says why someone could not be removed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    stubFetch({
      "GET /api/admin/waitlist": { json: WAITLIST },
      "DELETE /api/admin/waitlist": {
        status: 409,
        json: { error: "Withdraw the offer before removing this person" },
      },
    });
    renderPanel();

    fireEvent.click(await screen.findByText("Remove"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Withdraw the offer before removing this person",
    );
  });

  it("reloads the list after a removal that took", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let removed = false;
    const fetchMock = stubFetch({
      "GET /api/admin/waitlist": () => ({
        json: removed ? { ...WAITLIST, entries: [] } : WAITLIST,
      }),
      "DELETE /api/admin/waitlist": () => {
        removed = true;
        return { json: { deleted: true } };
      },
    });
    renderPanel();

    fireEvent.click(await screen.findByText("Remove"));

    expect(
      await screen.findByText("Nobody on the waiting list yet."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([, init]) => init === undefined),
      ).toHaveLength(2),
    );
  });
});

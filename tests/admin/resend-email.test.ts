import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

const {
  selectRows,
  mockSelectFrom,
  mockUpdate,
  mockUpdateSet,
  mockSendBookingConfirmation,
  mockSendBookingNotification,
  mockSendBundleConfirmation,
  mockEq,
} = vi.hoisted(() => {
  const selectRows: unknown[] = [];
  const selectWhere = vi.fn(async () => selectRows);
  const mockInnerJoin = vi.fn();
  const mockLeftJoin = vi.fn();
  const mockSelectFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  mockInnerJoin.mockReturnValue({
    innerJoin: mockInnerJoin,
    leftJoin: mockLeftJoin,
    where: selectWhere,
  });
  mockLeftJoin.mockReturnValue({ where: selectWhere });

  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });

  return {
    selectRows,
    mockSelectFrom,
    mockUpdate,
    mockUpdateSet,
    mockSendBookingConfirmation: vi.fn().mockResolvedValue({ success: true }),
    mockSendBookingNotification: vi.fn().mockResolvedValue({ success: true }),
    mockSendBundleConfirmation: vi.fn().mockResolvedValue({ success: true }),
    mockEq: vi.fn((...args: unknown[]) => args),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    update: mockUpdate,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "bookings.id", scheduleId: "bookings.schedule_id" },
  bundles: { id: "bundles.id", bundleConfigId: "bundles.bundle_config_id" },
  bundleConfig: { id: "bundle_config.id", credits: "bundle_config.credits" },
  classes: { id: "classes.id" },
  schedules: { id: "schedules.id", classId: "schedules.class_id" },
}));

vi.mock("drizzle-orm", () => ({ eq: mockEq }));

vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: mockSendBookingConfirmation,
  sendBookingNotification: mockSendBookingNotification,
  sendBundleConfirmation: mockSendBundleConfirmation,
}));

import { POST } from "@/app/api/admin/resend-email/route";
import {
  signedInAsAdmin,
  signedInAsNonAdmin,
  signedOut,
} from "../support/admin-session";

function queue(...rows: unknown[]) {
  selectRows.length = 0;
  selectRows.push(...rows);
}

function request(body: unknown) {
  return new Request("http://localhost:3000/api/admin/resend-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const BOOKING_ROW = {
  bookings: {
    id: 12,
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    status: "confirmed",
  },
  schedules: {
    id: 42,
    date: "2026-06-09",
    startTime: "10:00:00",
    endTime: "11:00:00",
    location: "Studio 1, Hove",
  },
  classes: { id: 3, title: "Prenatal Yoga", priceInPence: 1500 },
  // The bundle the booking was funded from: a left join, so null when the
  // customer paid by card.
  bundles: null,
};

const BUNDLE_ROW = {
  bundles: {
    id: 5,
    customerEmail: "jane@example.com",
    creditsTotal: 6,
    expiresAt: "2026-12-01T00:00:00.000Z",
    bundleConfigId: 2,
  },
  bundle_config: { id: 2, name: "6-Class Bundle", credits: 6 },
};

describe("POST /api/admin/resend-email — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    queue();
  });

  it("returns 400 for a type that is neither booking nor bundle", async () => {
    const response = await POST(request({ type: "postcard", id: 1 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid type" });
    expect(mockSelectFrom).not.toHaveBeenCalled();
  });

  it("returns 400 when the id is missing", async () => {
    const response = await POST(request({ type: "booking" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Missing id" });
  });

  it("returns 400 rather than 500 for a malformed body", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 401 for an unauthenticated caller and sends nothing", async () => {
    signedOut();

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(401);
    expect(mockSendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("returns 403 for a signed-in caller who is not the admin", async () => {
    signedInAsNonAdmin();

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(403);
    expect(mockSendBookingConfirmation).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/resend-email — a booking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    queue(BOOKING_ROW);
  });

  it("sends the confirmation and the notification, then marks it sent", async () => {
    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    expect(mockSendBookingConfirmation).toHaveBeenCalledWith({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      date: "2026-06-09",
      startTime: "10:00:00",
      endTime: "11:00:00",
      location: "Studio 1, Hove",
      payment: { method: "card", priceInPence: 1500 },
    });
    expect(mockSendBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "individual",
        classTitle: "Prenatal Yoga",
      }),
    );
    expect(mockUpdateSet).toHaveBeenCalledWith({ emailSent: true });
  });

  it("resends a credit booking as a credit, not as a price", async () => {
    queue({ ...BOOKING_ROW, bundles: { id: 5, creditsRemaining: 2 } });

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(200);
    expect(mockSendBookingConfirmation).toHaveBeenCalledWith({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      date: "2026-06-09",
      startTime: "10:00:00",
      endTime: "11:00:00",
      location: "Studio 1, Hove",
      payment: { method: "credit", creditsRemaining: 2 },
    });
    expect(mockSendBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        payment: { method: "credit", creditsRemaining: 2 },
      }),
    );
  });

  it("returns 404 when the booking is gone", async () => {
    queue();

    const response = await POST(request({ type: "booking", id: 999 }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Booking not found" });
    expect(mockSendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("refuses a held seat — nobody has taken that offer up yet", async () => {
    queue({
      ...BOOKING_ROW,
      bookings: { ...BOOKING_ROW.bookings, status: "held" },
    });

    const response = await POST(request({ type: "booking", id: 12 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This seat is being held, not booked",
    });
    expect(mockSendBookingConfirmation).not.toHaveBeenCalled();
    expect(mockUpdateSet).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/resend-email — a bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signedInAsAdmin();
    queue(BUNDLE_ROW);
  });

  it("names the product the purchase recorded, not one with matching credits", async () => {
    const response = await POST(request({ type: "bundle", id: 5 }));

    expect(response.status).toBe(200);
    // The join is on the recorded config, so two configs selling six classes
    // can no longer be confused for one another.
    expect(mockEq).toHaveBeenCalledWith(
      "bundles.bundle_config_id",
      "bundle_config.id",
    );
    expect(mockSendBundleConfirmation).toHaveBeenCalledWith({
      customerEmail: "jane@example.com",
      bundleName: "6-Class Bundle",
      credits: 6,
      expiryDate: "1 Dec 2026",
    });
    expect(mockSendBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "bundle", bundleName: "6-Class Bundle" }),
    );
    expect(mockUpdateSet).toHaveBeenCalledWith({ emailSent: true });
  });

  it("returns 404 when the bundle is gone", async () => {
    queue();

    const response = await POST(request({ type: "bundle", id: 999 }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Bundle not found" });
    expect(mockSendBundleConfirmation).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockSelectInnerJoin,
  mockUpdateSet,
  mockUpdateWhere,
  mockSendBookingConfirmation,
  mockSendBundleConfirmation,
  mockSendBookingNotification,
  mockRunDailyOfferWork,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn().mockResolvedValue([]);
  const mockSelectInnerJoin = vi
    .fn()
    .mockReturnValue({ where: mockSelectWhere });
  const mockSelectFrom = vi.fn().mockReturnValue({
    innerJoin: mockSelectInnerJoin,
    where: mockSelectWhere,
  });
  const mockUpdateWhere = vi.fn().mockResolvedValue([]);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockSendBookingConfirmation = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockSendBundleConfirmation = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockSendBookingNotification = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockRunDailyOfferWork = vi.fn().mockResolvedValue({
    expiredOffers: { found: 0, released: 0, emailed: 0, failed: 0 },
    digest: { sent: false, items: 0 },
  });
  return {
    mockSelectFrom,
    mockSelectWhere,
    mockSelectInnerJoin,
    mockUpdateSet,
    mockUpdateWhere,
    mockSendBookingConfirmation,
    mockSendBundleConfirmation,
    mockSendBookingNotification,
    mockRunDailyOfferWork,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: {
    id: "id",
    emailSent: "email_sent",
    createdAt: "created_at",
    stripePaymentId: "stripe_payment_id",
    scheduleId: "schedule_id",
    status: "status",
  },
  bundles: {
    id: "id",
    emailSent: "email_sent",
    purchasedAt: "purchased_at",
    stripePaymentId: "stripe_payment_id",
    creditsTotal: "credits_total",
  },
  bundleConfig: { id: "id", credits: "credits" },
  schedules: { id: "id", classId: "class_id" },
  classes: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: mockSendBookingConfirmation,
  sendBundleConfirmation: mockSendBundleConfirmation,
  sendBookingNotification: mockSendBookingNotification,
}));

// The daily offer work is folded into this handler; what it does is covered in
// tests/api/cron-offer-sweep.test.ts. Here it is only wiring.
vi.mock("@/lib/waitlist/daily", () => ({
  runDailyOfferWork: mockRunDailyOfferWork,
}));

import { ne } from "drizzle-orm";
import { POST } from "@/app/api/cron/retry-emails/route";

describe("POST /api/cron/retry-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockSelectFrom.mockReturnValue({
      innerJoin: mockSelectInnerJoin,
      where: mockSelectWhere,
    });
    mockSelectWhere.mockResolvedValue([]);
    mockSelectInnerJoin.mockReturnValue({
      innerJoin: mockSelectInnerJoin,
      where: mockSelectWhere,
    });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  });

  it("returns 401 without valid authorization", async () => {
    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(mockRunDailyOfferWork).not.toHaveBeenCalled();
  });

  it("returns 401 with wrong secret", async () => {
    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 200 with summary when no pending emails", async () => {
    mockSelectWhere.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.retriedBookings).toBe(0);
    expect(body.retriedBundles).toBe(0);
  });

  it("runs the daily offer work too", async () => {
    // Only daily schedules are permitted here, so the offer sweep and digest
    // ride along with the daily run that already exists.
    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    const response = await POST(request);

    expect(mockRunDailyOfferWork).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({
      expiredOffers: { found: 0 },
      digest: { sent: false },
    });
  });

  it("leaves held seats out of the sweep", async () => {
    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    await POST(request);

    // Nobody has taken a held seat up, so there is no confirmation owing on it.
    expect(vi.mocked(ne)).toHaveBeenCalledWith("status", "held");
  });

  it("retries failed booking emails and updates emailSent", async () => {
    mockSelectFrom
      .mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                bookings: {
                  id: 1,
                  customerName: "Jane Doe",
                  customerEmail: "jane@example.com",
                  stripePaymentId: "cs_test_1",
                },
                schedules: {
                  date: "2026-05-01",
                  startTime: "09:00",
                  endTime: "10:00",
                  location: "Studio 1",
                },
                classes: { title: "Prenatal Yoga", priceInPence: 1250 },
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mockSendBookingConfirmation).toHaveBeenCalled();
    expect(mockSendBookingNotification).toHaveBeenCalled();
  });
});

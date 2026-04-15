import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks - available inside vi.mock factories
const {
  mockInsertValues,
  mockInsert,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockTransaction,
  mockBundleConfigWhere,
  mockBundleConfigFrom,
  mockBundleConfigSelect,
  mockSendBookingConfirmation,
  mockSendBundleConfirmation,
  mockSendBookingNotification,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  const mockUpdateWhere = vi.fn().mockResolvedValue([]);
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
  const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = { insert: mockInsert, update: mockUpdate };
    await fn(tx);
  });
  const mockBundleConfigWhere = vi.fn().mockResolvedValue([]);
  const mockBundleConfigFrom = vi
    .fn()
    .mockReturnValue({ where: mockBundleConfigWhere });
  const mockBundleConfigSelect = vi
    .fn()
    .mockReturnValue({ from: mockBundleConfigFrom });
  const mockSendBookingConfirmation = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockSendBundleConfirmation = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockSendBookingNotification = vi
    .fn()
    .mockResolvedValue({ success: true });
  return {
    mockInsertValues,
    mockInsert,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockTransaction,
    mockBundleConfigWhere,
    mockBundleConfigFrom,
    mockBundleConfigSelect,
    mockSendBookingConfirmation,
    mockSendBundleConfirmation,
    mockSendBookingNotification,
  };
});

vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: mockSendBookingConfirmation,
  sendBundleConfirmation: mockSendBundleConfirmation,
  sendBookingNotification: mockSendBookingNotification,
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: vi.fn((fn: () => Promise<void>) => fn()),
  };
});

// Mock Stripe
const mockConstructEvent = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  }),
}));

// Mock DB with transaction support
vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
    select: mockBundleConfigSelect,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", scheduleId: "schedule_id" },
  bundles: { id: "id" },
  bundleConfig: { id: "id" },
  schedules: { id: "id", bookedCount: "booked_count" },
  classes: { id: "id" },
}));

import type Stripe from "stripe";
import { POST } from "@/app/api/stripe/webhook/route";

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mock return values after clear
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockResolvedValue([{ id: 1 }]);
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue([]);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<void>) => {
        const tx = { insert: mockInsert, update: mockUpdate };
        await fn(tx);
      },
    );
    mockBundleConfigWhere.mockResolvedValue([]);
    mockBundleConfigFrom.mockReturnValue({ where: mockBundleConfigWhere });
    mockSendBookingConfirmation.mockResolvedValue({ success: true });
    mockSendBundleConfirmation.mockResolvedValue({ success: true });
    mockSendBookingNotification.mockResolvedValue({ success: true });
  });

  it("returns 400 when stripe-signature header is missing", async () => {
    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      body: "{}",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing signature");
  });

  it("returns 400 for invalid signature", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "invalid" },
      body: "{}",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid signature");
  });

  it("creates booking inside a transaction for individual purchase", async () => {
    // Mock schedule+class query for email sending in after()
    mockBundleConfigSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
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
    });

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_123",
          metadata: {
            type: "individual",
            scheduleId: "1",
            customerName: "Jane Doe",
            customerEmail: "jane@example.com",
          },
        },
      },
    } as unknown as Stripe.Event);

    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "valid" },
      body: "{}",
    });

    const response = await POST(request);
    // Flush microtasks so the after() callback completes
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(response.status).toBe(200);

    // Verify transaction was used
    expect(mockTransaction).toHaveBeenCalledOnce();

    // Verify insert was called with booking data
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        stripePaymentId: "cs_test_123",
      }),
    );

    // Verify schedule bookedCount was incremented
    expect(mockUpdate).toHaveBeenCalled();

    // Verify email functions were called
    expect(mockSendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        classTitle: "Prenatal Yoga",
      }),
    );
    expect(mockSendBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "individual",
        customerName: "Jane Doe",
      }),
    );
  });

  it("creates bundle record for bundle purchase", async () => {
    mockBundleConfigWhere.mockResolvedValue([
      { id: 1, name: "6-Class Bundle", credits: 6, expiryDays: 90 },
    ]);

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_bundle_456",
          metadata: {
            type: "bundle",
            bundleConfigId: "1",
            customerEmail: "jane@example.com",
          },
        },
      },
    } as unknown as Stripe.Event);

    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "valid" },
      body: "{}",
    });

    const response = await POST(request);
    // Flush microtasks so the after() callback completes
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(response.status).toBe(200);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "jane@example.com",
        stripePaymentId: "cs_test_bundle_456",
        creditsTotal: 6,
        creditsRemaining: 6,
      }),
    );

    // Verify expiresAt is roughly 90 days from now
    const callArgs = mockInsertValues.mock.calls[0][0];
    const expiresAt = callArgs.expiresAt as Date;
    const expectedExpiry = new Date();
    expectedExpiry.setDate(expectedExpiry.getDate() + 90);
    expect(
      Math.abs(expiresAt.getTime() - expectedExpiry.getTime()),
    ).toBeLessThan(5000);

    expect(mockSendBundleConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "jane@example.com",
        bundleName: "6-Class Bundle",
        credits: 6,
      }),
    );
    expect(mockSendBookingNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "bundle",
        customerEmail: "jane@example.com",
      }),
    );
  });

  it("returns 500 when bundle config not found", async () => {
    mockBundleConfigWhere.mockResolvedValue([]);

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_bundle_missing",
          metadata: {
            type: "bundle",
            bundleConfigId: "999",
            customerEmail: "jane@example.com",
          },
        },
      },
    } as unknown as Stripe.Event);

    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "valid" },
      body: "{}",
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Bundle config not found");
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 200 for unhandled event types", async () => {
    mockConstructEvent.mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: {} },
    } as unknown as Stripe.Event);

    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "valid" },
      body: "{}",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // No DB operations should have occurred
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

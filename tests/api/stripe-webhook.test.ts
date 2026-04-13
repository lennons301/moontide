import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks - available inside vi.mock factories
const {
  mockInsertValues,
  mockInsert,
  mockUpdateWhere,
  mockUpdateSet,
  mockUpdate,
  mockTransaction,
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
  return {
    mockInsertValues,
    mockInsert,
    mockUpdateWhere,
    mockUpdateSet,
    mockUpdate,
    mockTransaction,
  };
});

// Mock Stripe
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

// Mock DB with transaction support
vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", scheduleId: "schedule_id" },
  bundles: { id: "id" },
  schedules: { id: "id", bookedCount: "booked_count" },
}));

import { POST } from "@/app/api/stripe/webhook/route";
import { stripe } from "@/lib/stripe";

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
    vi.mocked(stripe.webhooks.constructEvent).mockImplementation(() => {
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
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
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
    } as unknown as ReturnType<typeof stripe.webhooks.constructEvent>);

    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "valid" },
      body: "{}",
    });

    const response = await POST(request);
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
  });

  it("creates bundle record for bundle purchase", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_bundle_456",
          metadata: {
            type: "bundle",
            customerEmail: "jane@example.com",
          },
        },
      },
    } as unknown as ReturnType<typeof stripe.webhooks.constructEvent>);

    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "valid" },
      body: "{}",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Verify db.insert was called for the bundle
    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "jane@example.com",
        stripePaymentId: "cs_test_bundle_456",
      }),
    );

    // Verify expiresAt is roughly 90 days from now
    const callArgs = mockInsertValues.mock.calls[0][0];
    const expiresAt = callArgs.expiresAt as Date;
    const expectedExpiry = new Date();
    expectedExpiry.setDate(expectedExpiry.getDate() + 90);
    // Allow 5 seconds tolerance
    expect(
      Math.abs(expiresAt.getTime() - expectedExpiry.getTime()),
    ).toBeLessThan(5000);
  });

  it("returns 200 for unhandled event types", async () => {
    vi.mocked(stripe.webhooks.constructEvent).mockReturnValue({
      type: "payment_intent.succeeded",
      data: { object: {} },
    } as unknown as ReturnType<typeof stripe.webhooks.constructEvent>);

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

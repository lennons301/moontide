import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks - available inside vi.mock factories
const {
  mockInsertValues,
  mockInsertReturning,
  mockInsert,
  mockUpdateWhere,
  mockUpdateReturning,
  mockUpdateSet,
  mockUpdate,
  mockTransaction,
  mockBundleConfigWhere,
  mockBundleConfigFrom,
  mockBundleConfigSelect,
  mockSendBookingConfirmation,
  mockSendBundleConfirmation,
  mockSendBookingNotification,
  mockDelete,
  mockDeleteWhere,
  mockFindOfferByToken,
} = vi.hoisted(() => {
  // The bundle insert is guarded on the unique payment id and reads back what
  // it wrote; the booking insert just awaits the values(). So the chain has to
  // be both awaitable and chainable, as the update chain below already is.
  const mockInsertReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
  const mockInsertValues = vi.fn((_values: Record<string, unknown>) =>
    Object.assign(Promise.resolve([{ id: 1 }]), {
      onConflictDoNothing: () => ({ returning: mockInsertReturning }),
    }),
  );
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues });
  // Occupancy writes read back the row via .returning(); plain updates just
  // await the where(), so the chain has to be both awaitable and chainable.
  const mockUpdateReturning = vi
    .fn()
    .mockResolvedValue([{ bookedCount: 1, capacity: 8 }]);
  const mockUpdateWhere = vi.fn(() =>
    Object.assign(Promise.resolve([]), { returning: mockUpdateReturning }),
  );
  const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockUpdateSet });
  const mockDeleteWhere = vi.fn().mockResolvedValue([]);
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });
  const mockTransaction = vi.fn(
    async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = { insert: mockInsert, update: mockUpdate, delete: mockDelete };
      return fn(tx);
    },
  );
  const mockFindOfferByToken = vi.fn().mockResolvedValue(null);
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
    mockInsertReturning,
    mockInsert,
    mockUpdateWhere,
    mockUpdateReturning,
    mockUpdateSet,
    mockUpdate,
    mockTransaction,
    mockBundleConfigWhere,
    mockBundleConfigFrom,
    mockBundleConfigSelect,
    mockSendBookingConfirmation,
    mockSendBundleConfirmation,
    mockSendBookingNotification,
    mockDelete,
    mockDeleteWhere,
    mockFindOfferByToken,
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
    delete: mockDelete,
    transaction: mockTransaction,
    select: mockBundleConfigSelect,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: {
    id: "id",
    scheduleId: "schedule_id",
    customerEmail: "customer_email",
    status: "status",
  },
  bundles: { id: "id" },
  bundleConfig: { id: "id" },
  schedules: { id: "id", bookedCount: "booked_count", capacity: "capacity" },
  classes: { id: "id" },
  waitlistEntries: { id: "id" },
}));

vi.mock("@/lib/waitlist/held-seats", () => ({
  findOfferByToken: mockFindOfferByToken,
}));

import type Stripe from "stripe";
import { POST } from "@/app/api/stripe/webhook/route";
import { schedules, waitlistEntries } from "@/lib/db/schema";

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup mock return values after clear
    mockInsert.mockReturnValue({ values: mockInsertValues });
    mockInsertValues.mockImplementation((_values: Record<string, unknown>) =>
      Object.assign(Promise.resolve([{ id: 1 }]), {
        onConflictDoNothing: () => ({ returning: mockInsertReturning }),
      }),
    );
    mockInsertReturning.mockResolvedValue([{ id: 1 }]);
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockImplementation(() =>
      Object.assign(Promise.resolve([]), { returning: mockUpdateReturning }),
    );
    mockUpdateReturning.mockResolvedValue([{ bookedCount: 1, capacity: 8 }]);
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          insert: mockInsert,
          update: mockUpdate,
          delete: mockDelete,
        };
        return fn(tx);
      },
    );
    mockDelete.mockReturnValue({ where: mockDeleteWhere });
    mockDeleteWhere.mockResolvedValue([]);
    mockFindOfferByToken.mockResolvedValue(null);
    mockBundleConfigWhere.mockResolvedValue([]);
    mockBundleConfigFrom.mockReturnValue({ where: mockBundleConfigWhere });
    // Reset, not just clear: these tests queue per-call select() results, and a
    // test that returns early leaves one behind for the next one to trip on.
    mockBundleConfigSelect.mockReset();
    mockBundleConfigSelect.mockReturnValue({ from: mockBundleConfigFrom });
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
    // 1st select() → existence check finds no current booking
    mockBundleConfigSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    // 2nd select() → schedule+class query for email sending in after()
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

  it("skips creating a duplicate individual booking when one already exists", async () => {
    // 1st select() → existence check finds an active booking
    mockBundleConfigSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ id: 99, status: "confirmed" }]),
      }),
    });

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_dupe",
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(response.status).toBe(200);

    // No second booking created, no seat counted, no email fired
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSendBookingConfirmation).not.toHaveBeenCalled();
  });

  describe("a payment for a seat held by an offer", () => {
    const TOKEN = "held-seat-token";

    /** Bookings this customer already has, then the class read for the email. */
    function selectsReturning(existing: { id: number; status: string }[]) {
      mockBundleConfigSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(existing),
        }),
      });
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
    }

    function liveOffer(overrides: Record<string, unknown> = {}) {
      return {
        id: 5,
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        offerToken: TOKEN,
        offerExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        heldBookingId: 77,
        heldBookingStatus: "held",
        ...overrides,
      };
    }

    function paymentEvent(metadata: Record<string, string>, id = "cs_offer") {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            id,
            metadata: {
              type: "individual",
              scheduleId: "1",
              customerName: "Jane Doe",
              customerEmail: "jane@example.com",
              ...metadata,
            },
          },
        },
      } as unknown as Stripe.Event);

      return new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "valid" },
        body: "{}",
      });
    }

    it("converts the held seat instead of reading it as a duplicate", async () => {
      // Without the conversion this is the silent failure the whole ticket is
      // about: the held seat looks like a duplicate delivery, so nothing is
      // written, nothing is sent, and the money is kept.
      selectsReturning([{ id: 77, status: "held" }]);
      mockFindOfferByToken.mockResolvedValue(liveOffer());
      mockUpdateReturning.mockResolvedValue([{ id: 77 }]);

      const response = await POST(
        paymentEvent({ offerToken: TOKEN, heldBookingId: "77" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(response.status).toBe(200);

      // Converted in place: the payment is recorded against the held booking
      // and no second booking is created.
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith({
        status: "confirmed",
        stripePaymentId: "cs_offer",
      });

      // Occupancy must not move — the offer counted this seat when it was made.
      expect(mockUpdate).not.toHaveBeenCalledWith(schedules);

      // The waiting-list entry goes with the acceptance.
      expect(mockDelete).toHaveBeenCalledWith(waitlistEntries);

      // The existing confirmation and admin notification, unchanged.
      expect(mockSendBookingConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          customerName: "Jane Doe",
          customerEmail: "jane@example.com",
          classTitle: "Prenatal Yoga",
        }),
      );
      expect(mockSendBookingNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: "individual" }),
      );
    });

    it("writes and sends nothing further on a repeated delivery", async () => {
      // The first delivery converted the seat and removed the entry, so the
      // token now matches nothing and the booking is already confirmed.
      selectsReturning([{ id: 77, status: "confirmed" }]);
      mockFindOfferByToken.mockResolvedValue(null);

      const response = await POST(
        paymentEvent({ offerToken: TOKEN, heldBookingId: "77" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(response.status).toBe(200);

      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockSendBookingConfirmation).not.toHaveBeenCalled();
      expect(mockSendBookingNotification).not.toHaveBeenCalled();
    });

    it("writes and sends nothing further when the seat is no longer held", async () => {
      // A credit got there first between the read and the guarded write.
      selectsReturning([{ id: 77, status: "held" }]);
      mockFindOfferByToken.mockResolvedValue(liveOffer());
      mockUpdateReturning.mockResolvedValue([]);

      const response = await POST(
        paymentEvent({ offerToken: TOKEN, heldBookingId: "77" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(response.status).toBe(200);

      expect(mockInsert).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockSendBookingConfirmation).not.toHaveBeenCalled();
    });

    it("books a customer whose hold was withdrawn under them", async () => {
      // Withdrawing deleted the held booking and gave the seat back. They have
      // paid, so they are booked — the ordinary paid path, over capacity or not.
      selectsReturning([]);
      mockFindOfferByToken.mockResolvedValue(null);

      const response = await POST(
        paymentEvent({ offerToken: TOKEN, heldBookingId: "77" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(response.status).toBe(200);

      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: 1,
          customerEmail: "jane@example.com",
          stripePaymentId: "cs_offer",
        }),
      );
      expect(mockSendBookingConfirmation).toHaveBeenCalled();
    });

    it("does not convert a held seat the token is not bound to", async () => {
      // Somebody else's live offer on the same class must not be spent here.
      selectsReturning([]);
      mockFindOfferByToken.mockResolvedValue(
        liveOffer({ customerEmail: "someone@else.com", heldBookingId: 99 }),
      );

      const response = await POST(
        paymentEvent({ offerToken: TOKEN, heldBookingId: "77" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(response.status).toBe(200);

      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalled();
    });

    it("books a paid customer onto a full class and logs the capacity raise", async () => {
      // Never refuse a payment on capacity grounds: the customer is charged by
      // the time this runs. The class gains the seat, and its capacity gains
      // one with it — occupancy may not exceed capacity. Gabrielle learns
      // about it instead of being asked to allow it.
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      selectsReturning([]);
      // The guarded claim finds no room; the forced write that follows takes
      // the seat and raises the capacity.
      mockUpdateReturning
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 1 }]);

      const response = await POST(paymentEvent({}, "cs_oversold"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(response.status).toBe(200);

      expect(mockInsert).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("Capacity raised"),
      );
      consoleError.mockRestore();
    });
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
        // Recorded outright, so nothing downstream has to infer the product
        // from the credit count.
        bundleConfigId: 1,
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

  it("grants nothing twice when a bundle purchase is redelivered", async () => {
    mockBundleConfigWhere.mockResolvedValue([
      { id: 1, name: "6-Class Bundle", credits: 6, expiryDays: 90 },
    ]);
    // The unique payment id caught it: this bundle is already on the table.
    mockInsertReturning.mockResolvedValue([]);

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
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 200, not an error: the first delivery did the work, so there is nothing
    // for Stripe to retry.
    expect(response.status).toBe(200);
    expect(mockSendBundleConfirmation).not.toHaveBeenCalled();
    expect(mockSendBookingNotification).not.toHaveBeenCalled();
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

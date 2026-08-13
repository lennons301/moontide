import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks
const {
  mockSelectFrom,
  mockInnerJoin,
  mockWhere,
  mockCheckoutSessionsCreate,
  mockFindOfferByToken,
} = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue([]);
  const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelectFrom = vi.fn().mockReturnValue({ innerJoin: mockInnerJoin });
  const mockCheckoutSessionsCreate = vi
    .fn()
    .mockResolvedValue({ url: "https://checkout.stripe.com/test" });
  const mockFindOfferByToken = vi.fn().mockResolvedValue(null);
  return {
    mockSelectFrom,
    mockInnerJoin,
    mockWhere,
    mockCheckoutSessionsCreate,
    mockFindOfferByToken,
  };
});

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id" },
  schedules: { id: "id", classId: "class_id" },
  bundleConfig: { id: "id", active: "active" },
  bookings: {
    id: "id",
    scheduleId: "schedule_id",
    customerEmail: "customer_email",
    status: "status",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  ne: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@/lib/waitlist/held-seats", () => ({
  findOfferByToken: mockFindOfferByToken,
}));

import { POST } from "@/app/api/book/checkout/route";

describe("POST /api/book/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({
      innerJoin: mockInnerJoin,
      where: mockWhere,
    });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    });
    mockFindOfferByToken.mockResolvedValue(null);
  });

  it("returns 400 when email is missing", async () => {
    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduleId: 1, customerName: "Jane Doe" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Email is required");
  });

  it("returns 400 when individual booking fields are missing", async () => {
    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerEmail: "jane@example.com" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 404 when schedule is not found", async () => {
    mockWhere.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 999,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Schedule not found");
  });

  it("returns 400 when schedule is not open", async () => {
    mockWhere.mockResolvedValue([
      {
        schedules: {
          id: 1,
          status: "cancelled",
          bookedCount: 0,
          capacity: 8,
        },
        classes: { id: 1, title: "Morning Yoga", priceInPence: 1200 },
      },
    ]);

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class is not available");
  });

  it("returns 400 when class is full", async () => {
    mockWhere.mockResolvedValue([
      {
        schedules: { id: 1, status: "open", bookedCount: 8, capacity: 8 },
        classes: { id: 1, title: "Morning Yoga", priceInPence: 1200 },
      },
    ]);

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class is full");
  });

  it("returns checkout URL for valid booking", async () => {
    mockWhere
      .mockResolvedValueOnce([
        {
          schedules: {
            id: 1,
            status: "open",
            bookedCount: 2,
            capacity: 8,
            date: "2026-05-01",
            startTime: "09:00",
            endTime: "10:00",
          },
          classes: { id: 1, title: "Morning Yoga", priceInPence: 1200 },
        },
      ])
      .mockResolvedValueOnce([]);

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBe("https://checkout.stripe.com/test");

    // Verify Stripe was called with correct params
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer_email: "jane@example.com",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "gbp",
              unit_amount: 1200,
              product_data: expect.objectContaining({
                name: "Morning Yoga",
              }),
            }),
            quantity: 1,
          }),
        ],
        metadata: expect.objectContaining({
          type: "individual",
          scheduleId: "1",
          customerName: "Jane Doe",
          customerEmail: "jane@example.com",
        }),
      }),
    );
  });

  it("returns 409 when customer already has a booking for this schedule", async () => {
    mockWhere
      .mockResolvedValueOnce([
        {
          schedules: {
            id: 1,
            status: "open",
            bookedCount: 2,
            capacity: 8,
            date: "2026-05-01",
            startTime: "09:00",
            endTime: "10:00",
          },
          classes: { id: 1, title: "Morning Yoga", priceInPence: 1200 },
        },
      ])
      .mockResolvedValueOnce([{ id: 99, status: "confirmed" }]);

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("You already have a booking for this class");
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("returns checkout URL for bundle purchase", async () => {
    // Mock bundleConfig query — selectFrom is called for bundle config lookup
    mockSelectFrom.mockReturnValueOnce({
      innerJoin: mockInnerJoin,
      where: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "6-Class Bundle",
          priceInPence: 6600,
          credits: 6,
          expiryDays: 90,
          active: true,
        },
      ]),
    });

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bundle",
        bundleConfigId: 1,
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBe("https://checkout.stripe.com/test");

    // Verify Stripe was called with DB-sourced bundle params
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer_email: "jane@example.com",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "gbp",
              unit_amount: 6600,
              product_data: expect.objectContaining({
                name: "6-Class Bundle",
                description: "6 classes, valid for 90 days from purchase",
              }),
            }),
            quantity: 1,
          }),
        ],
        metadata: expect.objectContaining({
          type: "bundle",
          bundleConfigId: "1",
          customerEmail: "jane@example.com",
        }),
      }),
    );
  });

  describe("paying by card for a held seat", () => {
    const HELD_SEAT_TOKEN = "held-seat-token";

    /** The class is full precisely because the recipient's seat is held. */
    function fullByTheHeldSeat() {
      mockWhere
        .mockResolvedValueOnce([
          {
            schedules: {
              id: 1,
              status: "open",
              bookedCount: 8,
              capacity: 8,
              date: "2026-05-01",
              startTime: "09:00",
              endTime: "10:00",
            },
            classes: { id: 1, title: "Morning Yoga", priceInPence: 1200 },
          },
        ])
        // Their own held seat comes back as an existing booking.
        .mockResolvedValueOnce([{ id: 77, status: "held" }]);
    }

    function liveOffer(overrides: Record<string, unknown> = {}) {
      return {
        id: 5,
        scheduleId: 1,
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        offerToken: HELD_SEAT_TOKEN,
        offerExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        heldBookingId: 77,
        heldBookingStatus: "held",
        ...overrides,
      };
    }

    function requestWithToken(token: string | null = HELD_SEAT_TOKEN) {
      return new Request("http://localhost:3000/api/book/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: 1,
          customerName: "Jane Doe",
          customerEmail: "jane@example.com",
          offerToken: token,
        }),
      });
    }

    it("starts checkout past the full class and the recipient's own held seat", async () => {
      fullByTheHeldSeat();
      mockFindOfferByToken.mockResolvedValue(liveOffer());

      const response = await POST(requestWithToken());
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.url).toBe("https://checkout.stripe.com/test");

      // The offer travels with the payment so the webhook converts the held
      // seat rather than reading it as a duplicate and keeping the money.
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            type: "individual",
            scheduleId: "1",
            customerEmail: "jane@example.com",
            offerToken: HELD_SEAT_TOKEN,
            heldBookingId: "77",
          }),
        }),
      );
    });

    it("carries no offer metadata on an ordinary booking", async () => {
      mockWhere
        .mockResolvedValueOnce([
          {
            schedules: {
              id: 1,
              status: "open",
              bookedCount: 2,
              capacity: 8,
              date: "2026-05-01",
              startTime: "09:00",
              endTime: "10:00",
            },
            classes: { id: 1, title: "Morning Yoga", priceInPence: 1200 },
          },
        ])
        .mockResolvedValueOnce([]);

      const response = await POST(requestWithToken(null));
      expect(response.status).toBe(200);

      const metadata = mockCheckoutSessionsCreate.mock.calls[0][0]
        .metadata as Record<string, string>;
      expect(metadata.offerToken).toBeUndefined();
      expect(metadata.heldBookingId).toBeUndefined();
      expect(mockFindOfferByToken).not.toHaveBeenCalled();
    });

    it("refuses a token that matches no offer, leaving the class full", async () => {
      fullByTheHeldSeat();
      mockFindOfferByToken.mockResolvedValue(null);

      const response = await POST(requestWithToken("made-up-token"));
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe("This offer is no longer available");
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses an expired offer", async () => {
      fullByTheHeldSeat();
      mockFindOfferByToken.mockResolvedValue(
        liveOffer({ offerExpiresAt: new Date(Date.now() - 1000) }),
      );

      const response = await POST(requestWithToken());
      expect(response.status).toBe(410);
      expect((await response.json()).error).toBe("This offer has expired");
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses a token presented by someone else", async () => {
      fullByTheHeldSeat();
      mockFindOfferByToken.mockResolvedValue(
        liveOffer({ customerEmail: "someone@else.com" }),
      );

      const response = await POST(requestWithToken());
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe(
        "This offer was made to a different email address",
      );
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses a token whose seat has already been taken up", async () => {
      fullByTheHeldSeat();
      mockFindOfferByToken.mockResolvedValue(
        liveOffer({ heldBookingStatus: "confirmed" }),
      );

      const response = await POST(requestWithToken());
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe(
        "This offer has already been taken up",
      );
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses a token used against a class it was not offered on", async () => {
      fullByTheHeldSeat();
      mockFindOfferByToken.mockResolvedValue(liveOffer({ scheduleId: 99 }));

      const response = await POST(requestWithToken());
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(
        "This offer is for a different class",
      );
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses a recipient who also has another booking on the class", async () => {
      mockWhere
        .mockResolvedValueOnce([
          {
            schedules: {
              id: 1,
              status: "open",
              bookedCount: 8,
              capacity: 8,
              date: "2026-05-01",
              startTime: "09:00",
              endTime: "10:00",
            },
            classes: { id: 1, title: "Morning Yoga", priceInPence: 1200 },
          },
        ])
        .mockResolvedValueOnce([
          { id: 77, status: "held" },
          { id: 88, status: "confirmed" },
        ]);
      mockFindOfferByToken.mockResolvedValue(liveOffer());

      const response = await POST(requestWithToken());
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe(
        "You already have a booking for this class",
      );
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses a cancelled class even with a valid token", async () => {
      mockWhere.mockResolvedValue([
        {
          schedules: {
            id: 1,
            status: "cancelled",
            bookedCount: 8,
            capacity: 8,
          },
          classes: { id: 1, title: "Morning Yoga", priceInPence: 1200 },
        },
      ]);
      mockFindOfferByToken.mockResolvedValue(liveOffer());

      const response = await POST(requestWithToken());
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("Class is not available");
      expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });
  });

  it("returns 400 when bundle config not found", async () => {
    mockSelectFrom.mockReturnValueOnce({
      innerJoin: mockInnerJoin,
      where: vi.fn().mockResolvedValue([]),
    });

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bundle",
        bundleConfigId: 999,
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bundle configuration not found");
  });
});

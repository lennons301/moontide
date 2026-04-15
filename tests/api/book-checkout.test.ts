import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks
const { mockSelectFrom, mockInnerJoin, mockWhere, mockCheckoutSessionsCreate } =
  vi.hoisted(() => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockInnerJoin = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelectFrom = vi
      .fn()
      .mockReturnValue({ innerJoin: mockInnerJoin });
    const mockCheckoutSessionsCreate = vi
      .fn()
      .mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    return {
      mockSelectFrom,
      mockInnerJoin,
      mockWhere,
      mockCheckoutSessionsCreate,
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
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
}));

import { POST } from "@/app/api/book/checkout/route";

describe("POST /api/book/checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ innerJoin: mockInnerJoin });
    mockInnerJoin.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
    mockCheckoutSessionsCreate.mockResolvedValue({
      url: "https://checkout.stripe.com/test",
    });
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
    mockWhere.mockResolvedValue([
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

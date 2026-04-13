import { describe, expect, it, vi } from "vitest";

// Mock Stripe
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}));

// Mock DB
vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
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
  });

  it("returns 200 for valid checkout.session.completed event", async () => {
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
  });
});

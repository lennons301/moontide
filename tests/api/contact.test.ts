import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email", () => ({
  sendContactEmail: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  contactSubmissions: {},
}));

import { POST } from "@/app/api/contact/route";

describe("POST /api/contact", () => {
  it("returns 200 for valid submission", async () => {
    const request = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Jane Doe",
        email: "jane@example.com",
        subject: "Enquiry",
        message: "Hello!",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it("returns 400 for missing fields", async () => {
    const request = new Request("http://localhost:3000/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Jane" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});

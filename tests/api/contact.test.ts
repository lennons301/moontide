import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications", () => ({
  notify: vi.fn().mockResolvedValue({ ok: true }),
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

/**
 * The contact form used to check nothing at all beyond presence: an address
 * with no `@` in it, a message of a megabyte and a name of whitespace were all
 * saved and forwarded. A reply is sent to whatever it stored, so what it stores
 * has to be an address.
 */
describe("POST /api/contact validation", () => {
  function submit(body: unknown) {
    return POST(
      new Request("http://localhost:3000/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  }

  const VALID = {
    name: "Jane Doe",
    email: "jane@example.com",
    subject: "Enquiry",
    message: "Hello!",
  };

  it("refuses an address that is not one", async () => {
    const response = await submit({ ...VALID, email: "jane-at-example" });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "A valid email address is required",
    );
  });

  it("refuses fields that are only whitespace", async () => {
    const response = await submit({ ...VALID, name: "   " });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("All fields are required");
  });

  it("refuses a message longer than the column is meant to hold", async () => {
    const response = await submit({ ...VALID, message: "x".repeat(5001) });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Your message is too long");
  });

  it("refuses a body that is not an object at all", async () => {
    const response = await submit("not a form");

    expect(response.status).toBe(400);
  });

  it("stores and forwards the trimmed, normalised submission", async () => {
    const { db } = await import("@/lib/db");
    const { notify } = await import("@/lib/notifications");
    const values = vi.fn().mockResolvedValue([]);
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const response = await submit({
      name: "  Jane Doe ",
      email: " Jane@Example.COM ",
      subject: " Enquiry ",
      message: " Hello! ",
    });

    expect(response.status).toBe(200);
    expect(values).toHaveBeenCalledWith({
      name: "Jane Doe",
      email: "jane@example.com",
      subject: "Enquiry",
      message: "Hello!",
    });
    expect(notify).toHaveBeenCalledWith(
      {
        type: "contact-message",
        name: "Jane Doe",
        email: "jane@example.com",
        subject: "Enquiry",
        message: "Hello!",
      },
      expect.objectContaining({ notRecorded: expect.any(String) }),
    );
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function () {
    return {
      emails: {
        send: vi.fn().mockResolvedValue({ id: "test-id" }),
      },
    };
  }),
}));

import { sendContactEmail } from "@/lib/email";

describe("sendContactEmail", () => {
  it("sends an email with the correct fields", async () => {
    const result = await sendContactEmail({
      name: "Jane Doe",
      email: "jane@example.com",
      subject: "Prenatal Yoga",
      message: "I'd like to know more about your prenatal classes.",
    });

    expect(result).toEqual({ success: true });
  });
});

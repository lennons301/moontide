import { describe, expect, it, vi } from "vitest";

vi.mock("resend", () => ({
  // biome-ignore lint/complexity/useArrowFunction: must be a constructor for `new Resend()`
  Resend: vi.fn().mockImplementation(function () {
    return {
      emails: {
        send: vi.fn().mockResolvedValue({ id: "test-id" }),
      },
    };
  }),
}));

import {
  buildEmailHtml,
  sendBookingConfirmation,
  sendBookingNotification,
  sendBundleConfirmation,
  sendContactEmail,
} from "@/lib/email";

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

describe("buildEmailHtml", () => {
  it("wraps body in branded HTML with logo", () => {
    const html = buildEmailHtml("<p>Hello</p>");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("moontide-logo.png");
    expect(html).toContain("#1e3a5f");
    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain("Moontide");
  });
});

describe("sendBookingConfirmation", () => {
  it("sends HTML email to customer with booking details", async () => {
    const result = await sendBookingConfirmation({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      date: "2026-05-01",
      startTime: "09:00",
      endTime: "10:00",
      location: "Studio 1, Hove",
      priceInPence: 1250,
    });

    expect(result).toEqual({ success: true });
  });
});

describe("sendBundleConfirmation", () => {
  it("sends HTML email to customer with bundle details", async () => {
    const result = await sendBundleConfirmation({
      customerEmail: "jane@example.com",
      bundleName: "6-Class Bundle",
      credits: 6,
      expiryDate: "30 Jul 2026",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("sendBookingNotification", () => {
  it("sends plain text notification for individual booking", async () => {
    const result = await sendBookingNotification({
      type: "individual",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      date: "2026-05-01",
      startTime: "09:00",
      endTime: "10:00",
      location: "Studio 1, Hove",
    });

    expect(result).toEqual({ success: true });
  });

  it("sends plain text notification for bundle purchase", async () => {
    const result = await sendBookingNotification({
      type: "bundle",
      customerEmail: "jane@example.com",
      bundleName: "6-Class Bundle",
      credits: 6,
      expiryDate: "30 Jul 2026",
    });

    expect(result).toEqual({ success: true });
  });
});

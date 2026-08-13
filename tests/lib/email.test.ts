import { describe, expect, it, vi } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ id: "test-id" }),
}));

vi.mock("resend", () => ({
  // biome-ignore lint/complexity/useArrowFunction: must be a constructor for `new Resend()`
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: mockSend } };
  }),
}));

/** What Resend was asked to send by the call under test. */
function lastSend() {
  return mockSend.mock.calls.at(-1)?.[0] as {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  };
}

import {
  buildEmailHtml,
  sendBookingConfirmation,
  sendBookingNotification,
  sendBundleConfirmation,
  sendContactEmail,
  sendOfferDigest,
  sendOfferExpired,
  sendRescheduleNotification,
  sendWaitlistConfirmation,
  sendWaitlistNotification,
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

describe("sendWaitlistConfirmation", () => {
  it("sends HTML email to customer with class details", async () => {
    const result = await sendWaitlistConfirmation({
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
});

describe("sendWaitlistNotification", () => {
  it("sends plain text notification with waitlist signup details", async () => {
    const result = await sendWaitlistNotification({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      date: "2026-05-01",
      startTime: "09:00",
      endTime: "10:00",
      waitlistCount: 3,
    });

    expect(result).toEqual({ success: true });
  });
});

describe("sendRescheduleNotification", () => {
  it("sends HTML email to customer with old and new class details", async () => {
    const result = await sendRescheduleNotification({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      oldDate: "2026-06-09",
      oldStartTime: "09:00",
      oldEndTime: "10:00",
      newDate: "2026-06-16",
      newStartTime: "09:00",
      newEndTime: "10:00",
      newLocation: "Studio 1, Hove",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("sendOfferExpired", () => {
  it("tells them the place has gone and they are still on the list", async () => {
    const result = await sendOfferExpired({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      date: "2026-05-01",
      startTime: "09:00",
      endTime: "10:00",
    });

    expect(result).toEqual({ success: true });
    const sent = lastSend();
    expect(sent.to).toBe("jane@example.com");
    expect(sent.subject).toContain("Prenatal Yoga");
    expect(sent.html).toContain("gone back to the class");
    expect(sent.html).toContain("still on the waiting list");
    // Nothing was taken from them, and nothing is being asked of them.
    expect(sent.html).not.toContain("Take this place");
  });
});

describe("sendOfferDigest", () => {
  const DIGEST = {
    seatsToOffer: [
      {
        scheduleId: 42,
        classTitle: "Prenatal Yoga",
        date: "2026-05-01",
        startTime: "09:00:00",
        endTime: "10:00:00",
        freeSeats: 2,
        waitingCount: 3,
      },
    ],
    offersOutstanding: [
      {
        scheduleId: 43,
        classTitle: "Vinyasa",
        date: "2026-05-02",
        startTime: "18:00:00",
        customerName: "Amy Bell",
        customerEmail: "amy@example.com",
        expiresAt: new Date("2026-05-01T17:00:00.000Z"),
      },
    ],
    owedAClass: [
      {
        bookingId: 7,
        customerName: "Priya Shah",
        customerEmail: "priya@example.com",
        classTitle: "Baby Yoga",
        date: "2026-03-20",
        releasedAt: new Date("2026-03-21T09:00:00.000Z"),
        daysSince: 41,
      },
    ],
    isEmpty: false,
  };

  it("goes to Gabrielle with all three sections and links into the admin", async () => {
    process.env.BETTER_AUTH_URL = "https://gabriellemoontide.co.uk";
    process.env.CONTACT_EMAIL = "gabrielle@example.com";

    const result = await sendOfferDigest(DIGEST);

    expect(result).toEqual({ success: true });
    const sent = lastSend();
    expect(sent.to).toBe("gabrielle@example.com");
    expect(sent.subject).toBe("[Moontide] 3 things need you");

    const text = sent.text ?? "";
    // Each entry names its class and date, and each section says where to act.
    expect(text).toContain("Prenatal Yoga, Friday 1 May, 09:00–10:00");
    expect(text).toContain("2 free seats, 3 people waiting");
    expect(text).toContain("Amy Bell (amy@example.com)");
    expect(text).toContain("held until");
    expect(text).toContain("Priya Shah (priya@example.com)");
    expect(text).toContain("released 41 days ago");
    expect(text).toContain("https://gabriellemoontide.co.uk/admin/schedule");
    expect(text).toContain("https://gabriellemoontide.co.uk/admin/bookings");
  });

  it("leaves out a section with nothing in it", async () => {
    await sendOfferDigest({
      ...DIGEST,
      offersOutstanding: [],
      owedAClass: [],
    });

    const text = lastSend().text ?? "";
    expect(text).toContain("FREE SEATS WITH PEOPLE WAITING (1)");
    expect(text).not.toContain("OFFERS OUTSTANDING");
    expect(text).not.toContain("OWED A CLASS");
    expect(lastSend().subject).toBe("[Moontide] 1 thing needs you");
  });
});

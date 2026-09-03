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
  sendBundleConfigMissingAlert,
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
  const BOOKING = {
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    classTitle: "Prenatal Yoga",
    date: "2026-05-01",
    startTime: "09:00",
    endTime: "10:00",
    location: "Studio 1, Hove",
  };

  it("states the price a card booking was charged", async () => {
    const result = await sendBookingConfirmation({
      ...BOOKING,
      payment: { method: "card", priceInPence: 1250 },
    });

    expect(result).toEqual({ success: true });
    const sent = lastSend();
    expect(sent.to).toBe("jane@example.com");
    expect(sent.html).toContain("Your class is booked!");
    expect(sent.html).toContain("Prenatal Yoga");
    expect(sent.html).toContain("Price");
    expect(sent.html).toContain("£12.50");
  });

  it("names the credit and the balance left, never a price", async () => {
    const result = await sendBookingConfirmation({
      ...BOOKING,
      payment: { method: "credit", creditsRemaining: 3 },
    });

    expect(result).toEqual({ success: true });
    const sent = lastSend();
    expect(sent.html).toContain("Your class is booked!");
    // She paid with one of her classes, so that is what the email says.
    expect(sent.html).toContain("1 class credit from your bundle");
    expect(sent.html).toContain("Credits left");
    expect(sent.html).toContain("3 classes");
    // No money changed hands, so no money is mentioned.
    expect(sent.html).not.toContain("£");
    expect(sent.html).not.toContain("Price");
  });

  it("counts a single remaining credit in the singular", async () => {
    await sendBookingConfirmation({
      ...BOOKING,
      payment: { method: "credit", creditsRemaining: 1 },
    });

    expect(lastSend().html).toContain("1 class");
    expect(lastSend().html).not.toContain("1 classes");
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

describe("sendBundleConfigMissingAlert", () => {
  it("says outright that a customer has paid and got nothing", async () => {
    await sendBundleConfigMissingAlert({
      customerEmail: "jane@example.com",
      sessionId: "cs_test_123",
      configReference: "999",
      granted: null,
    });

    const sent = lastSend();
    expect(sent.subject).toContain("ACTION NEEDED");
    expect(sent.text).toContain("WAS NOT granted");
    expect(sent.text).toContain("jane@example.com");
    // The two things a human needs to go and find the payment.
    expect(sent.text).toContain("cs_test_123");
    expect(sent.text).toContain("999");
  });

  it("says the customer is fine when the bundle was granted anyway", async () => {
    await sendBundleConfigMissingAlert({
      customerEmail: "jane@example.com",
      sessionId: "cs_test_123",
      configReference: "1",
      granted: { credits: 6, expiryDate: "10 Apr 2026" },
    });

    const sent = lastSend();
    expect(sent.subject).not.toContain("ACTION NEEDED");
    expect(sent.text).toContain("WAS granted");
    expect(sent.text).toContain("6 classes");
    expect(sent.text).toContain("10 Apr 2026");
  });
});

describe("sendBookingNotification", () => {
  const BOOKING = {
    type: "individual" as const,
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    classTitle: "Prenatal Yoga",
    date: "2026-05-01",
    startTime: "09:00",
    endTime: "10:00",
    location: "Studio 1, Hove",
  };

  it("sends plain text notification for individual booking", async () => {
    const result = await sendBookingNotification({
      ...BOOKING,
      payment: { method: "card", priceInPence: 1250 },
    });

    expect(result).toEqual({ success: true });
    const sent = lastSend();
    expect(sent.text).toContain("Jane Doe (jane@example.com)");
    expect(sent.text).toContain("Paid: £12.50");
  });

  it("says when the seat was taken with a bundle credit", async () => {
    // She needs to know no money came in for this one, and what the
    // customer has left.
    await sendBookingNotification({
      ...BOOKING,
      payment: { method: "credit", creditsRemaining: 3 },
    });

    const sent = lastSend();
    expect(sent.text).toContain("Paid: bundle credit (3 classes left)");
    expect(sent.text).not.toContain("£");
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

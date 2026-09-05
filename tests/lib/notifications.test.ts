import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateSet } = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  return { mockUpdateSet: vi.fn().mockReturnValue({ where: mockUpdateWhere }) };
});

// `notify` records what happened on the row that owed the email; the writes
// themselves are `delivery.ts`'s, tested for real in tests/integration.
vi.mock("@/lib/db", () => ({
  db: { update: vi.fn().mockReturnValue({ set: mockUpdateSet }) },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", emailAttempts: "email_attempts" },
  bundles: { id: "id", emailAttempts: "email_attempts" },
  waitlistEntries: { id: "id", emailAttempts: "email_attempts" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  sql: vi.fn(),
}));

import { notify } from "@/lib/notifications";
import { FROM_ADDRESS } from "@/lib/notifications/adapter";
import type { NotificationEvent } from "@/lib/notifications/events";
import type { InMemoryEmails } from "@/lib/notifications/in-memory-adapter";
import {
  givenEmailsCollected,
  resetEmailAdapter,
} from "../support/notifications";

/** Nothing here owes a row an email; the delivery record has its own describe. */
const NOT_RECORDED = { notRecorded: "a test" } as const;

let inbox: InMemoryEmails;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.BETTER_AUTH_URL = "https://gabriellemoontide.co.uk";
  process.env.CONTACT_EMAIL = "gabrielle@example.com";
  inbox = givenEmailsCollected();
});

afterEach(resetEmailAdapter);

/** Send one event and hand back what arrived. */
async function send(event: NotificationEvent) {
  const result = await notify(event, NOT_RECORDED);
  return { result, sent: inbox.sent };
}

const CLASS = {
  classTitle: "Prenatal Yoga",
  date: "2026-05-01",
  startTime: "09:00",
  endTime: "10:00",
};

const CUSTOMER = {
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
};

describe("who gets told", () => {
  it("sends the customer's copy and Gabrielle's, in that order", async () => {
    const { sent } = await send({
      type: "booking-confirmed",
      ...CUSTOMER,
      ...CLASS,
      location: "Studio 1, Hove",
      payment: { method: "card", priceInPence: 1250 },
    });

    expect(sent.map((message) => message.to)).toEqual([
      "jane@example.com",
      "gabrielle@example.com",
    ]);
  });

  it("tells only Gabrielle about a contact form message", async () => {
    const { sent } = await send({
      type: "contact-message",
      name: "Jane Doe",
      email: "jane@example.com",
      subject: "Prenatal Yoga",
      message: "I'd like to know more.",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("gabrielle@example.com");
    // Her reply goes to the person, not to the site.
    expect(sent[0].replyTo).toBe("jane@example.com");
  });

  it("tells only the customer about a move, an offer and a lapsed offer", async () => {
    await send({
      type: "booking-rescheduled",
      ...CUSTOMER,
      classTitle: "Prenatal Yoga",
      oldDate: "2026-06-09",
      oldStartTime: "09:00",
      oldEndTime: "10:00",
      newDate: "2026-06-16",
      newStartTime: "09:00",
      newEndTime: "10:00",
      newLocation: "Studio 1, Hove",
    });
    await send({
      type: "seat-offered",
      ...CUSTOMER,
      ...CLASS,
      location: null,
      expiresAt: new Date("2026-04-30T17:00:00.000Z"),
      offerToken: "tok",
    });
    await send({ type: "offer-expired", ...CUSTOMER, ...CLASS });

    expect(inbox.to("gabrielle@example.com")).toEqual([]);
    expect(inbox.to("jane@example.com")).toHaveLength(3);
  });

  it("falls back to Gabrielle's default address when none is configured", async () => {
    process.env.CONTACT_EMAIL = "";

    const { sent } = await send({
      type: "contact-message",
      name: "Jane Doe",
      email: "jane@example.com",
      subject: "Hello",
      message: "Hello",
    });

    expect(sent[0].to).toBe("gwaring5@googlemail.com");
  });

  it("sends everything from the one Moontide address", async () => {
    await send({ type: "offer-expired", ...CUSTOMER, ...CLASS });

    expect(inbox.sent[0].from).toBe(FROM_ADDRESS);
    expect(inbox.sent[0].from).toBe(
      "Moontide <noreply@gabriellemoontide.co.uk>",
    );
  });
});

describe("a booking confirmation", () => {
  const BOOKING = {
    type: "booking-confirmed",
    ...CUSTOMER,
    ...CLASS,
    location: "Studio 1, Hove",
  } as const;

  it("states the price a card booking was charged", async () => {
    const { sent } = await send({
      ...BOOKING,
      payment: { method: "card", priceInPence: 1250 },
    });

    const customer = sent[0];
    expect(customer.to).toBe("jane@example.com");
    expect(customer.subject).toBe(
      "Your Prenatal Yoga class is booked — Moontide",
    );
    expect(customer.html).toContain("Your class is booked!");
    expect(customer.html).toContain("Prenatal Yoga");
    expect(customer.html).toContain("Friday, 1 May 2026");
    expect(customer.html).toContain("Studio 1, Hove");
    expect(customer.html).toContain("Price");
    expect(customer.html).toContain("£12.50");
    // Branded, with the logo — this is the one a customer sees.
    expect(customer.html).toContain("moontide-logo.png");
    expect(customer.html).toContain("#1e3a5f");
  });

  it("names the credit and the balance left, never a price", async () => {
    const { sent } = await send({
      ...BOOKING,
      payment: { method: "credit", creditsRemaining: 3 },
    });

    const customer = sent[0];
    expect(customer.html).toContain("Your class is booked!");
    // She paid with one of her classes, so that is what the email says.
    expect(customer.html).toContain("1 class credit from your bundle");
    expect(customer.html).toContain("Credits left");
    expect(customer.html).toContain("3 classes");
    // No money changed hands, so no money is mentioned.
    expect(customer.html).not.toContain("£");
    expect(customer.html).not.toContain("Price");
  });

  it("counts a single remaining credit in the singular", async () => {
    const { sent } = await send({
      ...BOOKING,
      payment: { method: "credit", creditsRemaining: 1 },
    });

    expect(sent[0].html).toContain("1 class");
    expect(sent[0].html).not.toContain("1 classes");
  });

  it("leaves out a location the class does not have", async () => {
    const { sent } = await send({
      ...BOOKING,
      location: null,
      payment: { method: "card", priceInPence: 1250 },
    });

    expect(sent[0].html).not.toContain("Location");
    expect(sent[1].text).not.toContain("Location");
  });

  it("tells Gabrielle in plain text what came in for the seat", async () => {
    const { sent } = await send({
      ...BOOKING,
      payment: { method: "card", priceInPence: 1250 },
    });

    const admin = sent[1];
    expect(admin.subject).toBe("[Moontide] New booking: Prenatal Yoga");
    expect(admin.text).toContain("Jane Doe (jane@example.com)");
    expect(admin.text).toContain("Paid: £12.50");
    expect(admin.html).toBeUndefined();
  });

  it("says when the seat was taken with a bundle credit", async () => {
    // She needs to know no money came in for this one, and what the
    // customer has left.
    const { sent } = await send({
      ...BOOKING,
      payment: { method: "credit", creditsRemaining: 3 },
    });

    expect(sent[1].text).toContain("Paid: bundle credit (3 classes left)");
    expect(sent[1].text).not.toContain("£");
  });
});

describe("a booking that has been moved", () => {
  it("names the class, the date it was on and the date it is on now", async () => {
    const { sent } = await send({
      type: "booking-rescheduled",
      ...CUSTOMER,
      classTitle: "Prenatal Yoga",
      oldDate: "2026-06-09",
      oldStartTime: "09:00",
      oldEndTime: "10:00",
      newDate: "2026-06-16",
      newStartTime: "11:00",
      newEndTime: "12:00",
      newLocation: "Studio 1, Hove",
    });

    expect(sent[0].subject).toBe("Your booking has been moved — Prenatal Yoga");
    expect(sent[0].html).toContain("Tuesday, 9 June 2026, 09:00–10:00");
    expect(sent[0].html).toContain("Tuesday, 16 June 2026, 11:00–12:00");
    expect(sent[0].html).toContain("Studio 1, Hove");
  });
});

describe("a bundle purchase", () => {
  const BUNDLE = {
    type: "bundle-purchased",
    customerEmail: "jane@example.com",
    bundleName: "6-Class Bundle",
    credits: 6,
    expiryDate: "30 Jul 2026",
  } as const;

  it("tells the customer what she bought and how to spend it", async () => {
    const { sent } = await send(BUNDLE);

    expect(sent[0].to).toBe("jane@example.com");
    expect(sent[0].subject).toBe("Your 6-Class Bundle is ready — Moontide");
    expect(sent[0].html).toContain("6-Class Bundle");
    expect(sent[0].html).toContain("6 classes");
    expect(sent[0].html).toContain("30 Jul 2026");
    expect(sent[0].html).toContain(
      "Use this email address when booking classes",
    );
  });

  it("tells Gabrielle in plain text", async () => {
    const { sent } = await send(BUNDLE);

    expect(sent[1].to).toBe("gabrielle@example.com");
    expect(sent[1].subject).toBe("[Moontide] New bundle purchase");
    expect(sent[1].text).toContain("Customer: jane@example.com");
    expect(sent[1].text).toContain("Credits: 6");
    expect(sent[1].text).toContain("Expires: 30 Jul 2026");
  });
});

describe("a bundle whose product has gone", () => {
  it("says outright that a customer has paid and got nothing", async () => {
    const { sent } = await send({
      type: "bundle-product-missing",
      customerEmail: "jane@example.com",
      sessionId: "cs_test_123",
      configReference: "999",
      granted: null,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("gabrielle@example.com");
    expect(sent[0].subject).toContain("ACTION NEEDED");
    expect(sent[0].text).toContain("WAS NOT granted");
    expect(sent[0].text).toContain("jane@example.com");
    // The two things a human needs to go and find the payment.
    expect(sent[0].text).toContain("cs_test_123");
    expect(sent[0].text).toContain("999");
  });

  it("says the customer is fine when the bundle was granted anyway", async () => {
    const { sent } = await send({
      type: "bundle-product-missing",
      customerEmail: "jane@example.com",
      sessionId: "cs_test_123",
      configReference: "1",
      granted: { credits: 6, expiryDate: "10 Apr 2026" },
    });

    expect(sent[0].subject).not.toContain("ACTION NEEDED");
    expect(sent[0].text).toContain("WAS granted");
    expect(sent[0].text).toContain("6 classes");
    expect(sent[0].text).toContain("10 Apr 2026");
    expect(sent[0].text).toContain(
      "https://gabriellemoontide.co.uk/admin/bundles",
    );
  });
});

describe("a booking whose schedule was deleted before the webhook fired", () => {
  it("tells Gabrielle who paid and for what session, with nothing to send the customer", async () => {
    const { sent } = await send({
      type: "booking-schedule-missing",
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      sessionId: "cs_test_123",
      scheduleId: 999,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("gabrielle@example.com");
    expect(sent[0].subject).toContain("ACTION NEEDED");
    expect(sent[0].text).toContain("Jane Doe");
    expect(sent[0].text).toContain("jane@example.com");
    // The two things a human needs to go and find the payment.
    expect(sent[0].text).toContain("cs_test_123");
    expect(sent[0].text).toContain("999");
  });
});

describe("joining a waiting list", () => {
  const JOINED = {
    type: "waitlist-joined",
    ...CUSTOMER,
    ...CLASS,
    location: "Studio 1, Hove",
    waitlistCount: 3,
  } as const;

  it("confirms the place to the customer", async () => {
    const { sent } = await send(JOINED);

    expect(sent[0].subject).toBe("You're on the waiting list — Prenatal Yoga");
    expect(sent[0].html).toContain(
      "You're on the waiting list for Prenatal Yoga.",
    );
    expect(sent[0].html).toContain("Friday, 1 May 2026");
    expect(sent[0].html).toContain("Gabrielle will be in touch by email");
  });

  it("tells Gabrielle how long the list is now", async () => {
    const { sent } = await send(JOINED);

    expect(sent[1].subject).toBe(
      "[Moontide] New waitlist signup: Prenatal Yoga 2026-05-01",
    );
    expect(sent[1].text).toContain(
      "There are now 3 people on the waiting list",
    );
    expect(sent[1].text).toContain(
      "https://gabriellemoontide.co.uk/admin/schedule",
    );
  });

  it("counts one person waiting in the singular", async () => {
    const { sent } = await send({ ...JOINED, waitlistCount: 1 });

    expect(sent[1].text).toContain(
      "There are now 1 person on the waiting list",
    );
  });
});

describe("a seat being offered", () => {
  it("carries the deadline in London time and the link that takes the place", async () => {
    const { sent } = await send({
      type: "seat-offered",
      ...CUSTOMER,
      ...CLASS,
      location: "Studio 1, Hove",
      // A British Summer Time evening: 17:00 UTC is 18:00 in Hove.
      expiresAt: new Date("2026-04-30T17:00:00.000Z"),
      offerToken: "a-token",
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("jane@example.com");
    expect(sent[0].subject).toBe("A place has come up — Prenatal Yoga");
    expect(sent[0].html).toContain("A place has come up in Prenatal Yoga");
    expect(sent[0].html).toContain("Held until");
    expect(sent[0].html).toContain("Thursday 30 April at 18:00");
    // The link is the whole authorisation, so it appears as a button and as
    // something you can paste.
    expect(sent[0].html).toContain(
      "https://gabriellemoontide.co.uk/book/offer/a-token",
    );
    expect(sent[0].html).toContain("Take this place");
  });
});

describe("an offer nobody answered", () => {
  it("tells them the place has gone and they are still on the list", async () => {
    const { sent } = await send({
      type: "offer-expired",
      ...CUSTOMER,
      ...CLASS,
    });

    expect(sent[0].to).toBe("jane@example.com");
    expect(sent[0].subject).toContain("Prenatal Yoga");
    expect(sent[0].html).toContain("gone back to the class");
    expect(sent[0].html).toContain("still on the waiting list");
    // Nothing was taken from them, and nothing is being asked of them.
    expect(sent[0].html).not.toContain("Take this place");
  });
});

describe("the daily digest", () => {
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
    const { sent } = await send({ type: "daily-digest", digest: DIGEST });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("gabrielle@example.com");
    expect(sent[0].subject).toBe("[Moontide] 3 things need you");

    const text = sent[0].text ?? "";
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
    const { sent } = await send({
      type: "daily-digest",
      digest: { ...DIGEST, offersOutstanding: [], owedAClass: [] },
    });

    const text = sent[0].text ?? "";
    expect(text).toContain("FREE SEATS WITH PEOPLE WAITING (1)");
    expect(text).not.toContain("OFFERS OUTSTANDING");
    expect(text).not.toContain("OWED A CLASS");
    expect(sent[0].subject).toBe("[Moontide] 1 thing needs you");
  });
});

describe("the delivery record", () => {
  const BOOKING: NotificationEvent = {
    type: "booking-confirmed",
    ...CUSTOMER,
    ...CLASS,
    location: null,
    payment: { method: "card", priceInPence: 1250 },
  };

  it("marks the row sent when the copies got through", async () => {
    const result = await notify(BOOKING, { on: bookingsTable(), row: 7 });

    expect(result).toEqual({ ok: true });
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ emailSent: true, emailLastError: null }),
    );
  });

  it("records the failure, and does not claim it went, when it did not", async () => {
    inbox.failWhen((message) => message.to === "jane@example.com");

    const result = await notify(BOOKING, { on: bookingsTable(), row: 7 });

    expect(result.ok).toBe(false);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        emailLastError: "Refused to send to jane@example.com",
      }),
    );
    expect(mockUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ emailSent: true }),
    );
  });

  /**
   * The hazard this module was written to close. The two copies used to be
   * awaited in a row with one `emailSent` write after them, so Gabrielle's
   * copy failing left the row unsent — and the overnight sweep sent the
   * customer, who had hers, a second one.
   */
  it("does not un-send the customer's copy when Gabrielle's fails", async () => {
    inbox.failWhen((message) => message.to === "gabrielle@example.com");

    const result = await notify(BOOKING, { on: bookingsTable(), row: 7 });

    expect(result).toEqual({ ok: true });
    expect(inbox.to("jane@example.com")).toHaveLength(1);
    expect(mockUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ emailSent: true }),
    );
  });

  it("writes nothing at all for a notification nothing records", async () => {
    await notify(BOOKING, { notRecorded: "a test" });

    expect(mockUpdateSet).not.toHaveBeenCalled();
  });

  it("never throws, whatever the transport does", async () => {
    inbox.failWhen(() => true);

    await expect(
      notify(
        { type: "daily-digest", digest: { ...emptyDigest() } },
        NOT_RECORDED,
      ),
    ).resolves.toEqual({ ok: false, error: expect.any(Error) });
  });
});

/** The mocked schema's bookings table, typed loosely for the delivery target. */
function bookingsTable() {
  // biome-ignore lint/suspicious/noExplicitAny: the schema is mocked in this file
  return { id: "id", emailAttempts: "email_attempts" } as any;
}

function emptyDigest() {
  return {
    seatsToOffer: [],
    offersOutstanding: [],
    owedAClass: [],
    isEmpty: true,
  };
}

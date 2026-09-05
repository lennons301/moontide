import type { AdminDigest } from "@/lib/waitlist/digest";

/**
 * The things that happen at Moontide which somebody needs telling about.
 *
 * A call site names one of these and nothing else — not a template, not a
 * recipient, not a subject line. Who gets told is `./policy`, what they are told
 * is `./templates`, and how it reaches them is `./adapter`. Recipient choice
 * used to be inlined in each of eleven senders, which is why the same "who is
 * the admin" expression appeared four times and could have disagreed.
 */

/**
 * How the seat was paid for. One discriminator, carried by both booking emails:
 * a card payment has a price to state, a credit has a balance. A booking funded
 * by a bundle credit must never be shown a cash price it did not pay, so the
 * two cannot be confused for one another by a caller that simply forgets.
 */
export type BookingPayment =
  | { method: "card"; priceInPence: number }
  | { method: "credit"; creditsRemaining: number };

/** The class an email is about, as every schedule row holds it. */
type ClassOccasion = {
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type NotificationEvent =
  /** Someone used the contact form. */
  | {
      type: "contact-message";
      name: string;
      email: string;
      subject: string;
      message: string;
    }
  /** A seat was taken, by card or by credit. */
  | ({
      type: "booking-confirmed";
      customerName: string;
      customerEmail: string;
      location: string | null;
      payment: BookingPayment;
    } & ClassOccasion)
  /** Gabrielle moved a booking to another date. */
  | {
      type: "booking-rescheduled";
      customerName: string;
      customerEmail: string;
      classTitle: string;
      oldDate: string;
      oldStartTime: string;
      oldEndTime: string;
      newDate: string;
      newStartTime: string;
      newEndTime: string;
      newLocation: string | null;
    }
  /** A bundle of credits was bought. */
  | {
      type: "bundle-purchased";
      customerEmail: string;
      bundleName: string;
      credits: number;
      expiryDate: string;
    }
  /** A paid bundle named a product that is not there any more. */
  | {
      type: "bundle-product-missing";
      customerEmail: string;
      sessionId: string;
      /** What the session named, verbatim — it may be nothing, or nonsense. */
      configReference: string;
      /** The terms granted from the session itself, or null if nothing was. */
      granted: { credits: number; expiryDate: string } | null;
    }
  /**
   * An individual-class checkout session named a schedule that has since been
   * deleted — Gabrielle can delete a schedule right up until a booking exists
   * against it, and nothing stops that while a customer's checkout is still in
   * flight. Nothing is created for the payment, so this is the only record of
   * it beyond Stripe's own.
   */
  | {
      type: "booking-schedule-missing";
      customerName: string;
      customerEmail: string;
      sessionId: string;
      scheduleId: number;
    }
  /** Someone put their name down for a class that is full. */
  | ({
      type: "waitlist-joined";
      customerName: string;
      customerEmail: string;
      location: string | null;
      waitlistCount: number;
    } & ClassOccasion)
  /** Gabrielle held a free seat for one named person. */
  | ({
      type: "seat-offered";
      customerName: string;
      customerEmail: string;
      location: string | null;
      expiresAt: Date;
      /** The link is the authorisation, so the template composes it. */
      offerToken: string;
    } & ClassOccasion)
  /** A held seat went back because nobody answered. */
  | ({
      type: "offer-expired";
      customerName: string;
      customerEmail: string;
    } & ClassOccasion)
  /** The one email a day that says something is waiting on Gabrielle. */
  | { type: "daily-digest"; digest: AdminDigest };

export type NotificationEventType = NotificationEvent["type"];

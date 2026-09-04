import type { NotificationEvent } from "./events";
import type { Rendered, Template } from "./templates";
import * as templates from "./templates";

/**
 * Who gets told about what, as one table you can read top to bottom.
 *
 * This is the thing the codebase had nowhere: recipient choice lived inside each
 * of eleven senders, so "does Gabrielle hear about this?" could only be answered
 * by reading eleven functions, and the expression that resolves her address was
 * written out four times. Here an event's recipients *are* the keys of its row,
 * so a recipient with no template is not a thing that can exist.
 */

/** The two people a Moontide email can be for. */
export type Audience = "customer" | "admin";

/**
 * Customer first, always.
 *
 * Both copies used to be awaited in a row with one `emailSent` write after them,
 * so a customer copy that went out followed by an admin copy that threw left the
 * row unsent — and the overnight retry sent the customer a second one. The
 * customer's copy is what a retry would repeat, so it goes first and it alone
 * decides the outcome; Gabrielle's failing is logged and nothing else, because
 * everything it tells her is already a row in the admin.
 */
export const AUDIENCE_ORDER: readonly Audience[] = ["customer", "admin"];

type Recipients<E extends NotificationEvent> = Partial<
  Record<Audience, Template<E>>
>;

export const RECIPIENTS: {
  [E in NotificationEvent as E["type"]]: Recipients<E>;
} = {
  "contact-message": { admin: templates.contactMessageAdmin },
  "booking-confirmed": {
    customer: templates.bookingConfirmedCustomer,
    admin: templates.bookingConfirmedAdmin,
  },
  "booking-rescheduled": { customer: templates.bookingRescheduledCustomer },
  "bundle-purchased": {
    customer: templates.bundlePurchasedCustomer,
    admin: templates.bundlePurchasedAdmin,
  },
  "bundle-product-missing": { admin: templates.bundleProductMissingAdmin },
  "waitlist-joined": {
    customer: templates.waitlistJoinedCustomer,
    admin: templates.waitlistJoinedAdmin,
  },
  // A hold with a deadline on it. Only the person it is being held for is told;
  // Gabrielle made the offer herself, and the daily digest lists it back to her.
  "seat-offered": { customer: templates.seatOfferedCustomer },
  "offer-expired": { customer: templates.offerExpiredCustomer },
  "daily-digest": { admin: templates.dailyDigestAdmin },
};

/**
 * Gabrielle. There is one account and one inbox, and this is the only place
 * that says which — read at send time, not at import, so a deployment's
 * configuration is the one in force.
 */
export function adminEmail(): string {
  return process.env.CONTACT_EMAIL || "gwaring5@googlemail.com";
}

/** The templates for one event, with the union collapsed for the caller. */
export function recipientsFor(
  event: NotificationEvent,
): Partial<Record<Audience, (event: NotificationEvent) => Rendered>> {
  // The table is keyed by event type and each row is typed to its own event, a
  // correlation TypeScript cannot carry through a lookup on a union. The table
  // above is what guarantees the pairing.
  return RECIPIENTS[event.type] as Partial<
    Record<Audience, (event: NotificationEvent) => Rendered>
  >;
}

/**
 * Where this audience's copy goes. Every event with a customer copy carries the
 * address that copy is for — it is the same address the booking is keyed by.
 */
export function addressFor(
  audience: Audience,
  event: NotificationEvent,
): string {
  return audience === "admin"
    ? adminEmail()
    : (event as { customerEmail: string }).customerEmail;
}

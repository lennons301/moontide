import type { NotificationEvent } from "./events";
import {
  classCount,
  detailRow,
  detailTable,
  emailLayout,
  formatClassDate,
  formatDeadline,
  formatDigestDay,
  formatTime,
  siteUrl,
} from "./format";

/**
 * The words of every notification, and nothing else.
 *
 * A template is handed a domain event and answers with a subject and a body. It
 * does not know who it is going to (`./policy` decides that), it does not know
 * how it will be sent (`./adapter`), and it never decides whether to send at
 * all. Customer copies are the branded HTML; Gabrielle's are plain text, which
 * is what her working notes have always been.
 */

/** What a template answers with: the message, minus its recipient. */
export type Rendered = { subject: string; replyTo?: string } & (
  | { html: string; text?: never }
  | { text: string; html?: never }
);

/** A template for one event, for one of its recipients. */
export type Template<E extends NotificationEvent> = (event: E) => Rendered;

type EventOf<T extends NotificationEvent["type"]> = Extract<
  NotificationEvent,
  { type: T }
>;

// ---------------------------------------------------------------- contact form

export const contactMessageAdmin: Template<EventOf<"contact-message">> = (
  event,
) => ({
  subject: `[Moontide] ${event.subject}`,
  // She replies to the person, not to the site.
  replyTo: event.email,
  text: `Name: ${event.name}\nEmail: ${event.email}\nSubject: ${event.subject}\n\n${event.message}`,
});

// -------------------------------------------------------------------- bookings

export const bookingConfirmedCustomer: Template<
  EventOf<"booking-confirmed">
> = (event) => {
  // The one place the two payment methods differ. A credit booking names the
  // credit and what it leaves; only a card booking states a price.
  const paymentRows =
    event.payment.method === "card"
      ? detailRow("Price", `£${(event.payment.priceInPence / 100).toFixed(2)}`)
      : detailRow("Paid with", "1 class credit from your bundle") +
        detailRow("Credits left", classCount(event.payment.creditsRemaining));

  const body = `
    <p>Hi ${event.customerName},</p>
    <p><strong>Your class is booked!</strong></p>
    ${detailTable([
      detailRow("Class", event.classTitle),
      detailRow("Date", formatClassDate(event.date)),
      detailRow("Time", `${event.startTime}–${event.endTime}`),
      event.location ? detailRow("Location", event.location) : null,
      paymentRows,
    ])}
    <p>See you there!</p>`;

  return {
    subject: `Your ${event.classTitle} class is booked — Moontide`,
    html: emailLayout(body),
  };
};

export const bookingConfirmedAdmin: Template<EventOf<"booking-confirmed">> = (
  event,
) => {
  // She needs to know whether money came in for this seat or a credit was
  // spent on it — and if a credit, what the customer has left.
  const paid =
    event.payment.method === "card"
      ? `£${(event.payment.priceInPence / 100).toFixed(2)}`
      : `bundle credit (${classCount(event.payment.creditsRemaining)} left)`;

  return {
    subject: `[Moontide] New booking: ${event.classTitle}`,
    text: `New class booking:\n\nCustomer: ${event.customerName} (${event.customerEmail})\nClass: ${event.classTitle}\nDate: ${event.date}\nTime: ${event.startTime}–${event.endTime}${event.location ? `\nLocation: ${event.location}` : ""}\nPaid: ${paid}`,
  };
};

export const bookingRescheduledCustomer: Template<
  EventOf<"booking-rescheduled">
> = (event) => {
  const body = `
    <p>Hi ${event.customerName},</p>
    <p><strong>Your booking has been moved to a new date.</strong></p>
    ${detailTable([
      detailRow("Class", event.classTitle),
      detailRow(
        "From",
        `${formatClassDate(event.oldDate)}, ${event.oldStartTime}–${event.oldEndTime}`,
      ),
      detailRow(
        "To",
        `${formatClassDate(event.newDate)}, ${event.newStartTime}–${event.newEndTime}`,
      ),
      event.newLocation ? detailRow("Location", event.newLocation) : null,
    ])}
    <p>If this isn't right, please get in touch and we'll sort it out.</p>
    <p>— Gabrielle</p>`;

  return {
    subject: `Your booking has been moved — ${event.classTitle}`,
    html: emailLayout(body),
  };
};

// --------------------------------------------------------------------- bundles

export const bundlePurchasedCustomer: Template<EventOf<"bundle-purchased">> = (
  event,
) => {
  const body = `
    <p>Hello,</p>
    <p><strong>Your ${event.bundleName} is ready to use!</strong></p>
    ${detailTable([
      detailRow("Bundle", event.bundleName),
      detailRow("Credits", `${event.credits} classes`),
      detailRow("Valid until", event.expiryDate),
    ])}
    <p>Use this email address when booking classes to redeem your credits.</p>`;

  return {
    subject: `Your ${event.bundleName} is ready — Moontide`,
    html: emailLayout(body),
  };
};

export const bundlePurchasedAdmin: Template<EventOf<"bundle-purchased">> = (
  event,
) => ({
  subject: "[Moontide] New bundle purchase",
  text: `New bundle purchase:\n\nCustomer: ${event.customerEmail}\nBundle: ${event.bundleName}\nCredits: ${event.credits}\nExpires: ${event.expiryDate}`,
});

/**
 * A bundle was paid for and the config row it names is not there.
 *
 * Stripe is answered 200 either way — the condition is permanent, so retrying
 * it for three days recovers nothing and hides it — which means this email is
 * the only thing that tells anyone. It goes out whether or not the bundle was
 * granted from the session's own terms: something a purchase pointed at has
 * disappeared, and if the grant failed a customer has been charged for nothing.
 */
export const bundleProductMissingAdmin: Template<
  EventOf<"bundle-product-missing">
> = (event) => {
  const outcome = event.granted
    ? `The bundle WAS granted, from the terms recorded when she paid: ${event.granted.credits} classes, valid until ${event.granted.expiryDate}. She has her confirmation email and can book. Nothing is owed to her — but the bundle is not linked to a product, so resending her confirmation from the admin will not work.`
    : `The bundle WAS NOT granted. ${event.customerEmail} has been charged and has no credits. She needs a bundle creating by hand, or refunding.`;

  return {
    subject: event.granted
      ? "[Moontide] Bundle purchase: its product is missing"
      : "[Moontide] ACTION NEEDED: bundle paid for but not granted",
    text: `A bundle purchase named a bundle product that no longer exists.\n\nCustomer: ${event.customerEmail}\nStripe session: ${event.sessionId}\nProduct referenced: ${event.configReference}\n\n${outcome}\n\nBundles: ${siteUrl("/admin/bundles")}`,
  };
};

// ---------------------------------------------------------------- waiting list

export const waitlistJoinedCustomer: Template<EventOf<"waitlist-joined">> = (
  event,
) => {
  const body = `
    <p>Hi ${event.customerName},</p>
    <p><strong>You're on the waiting list for ${event.classTitle}.</strong></p>
    ${detailTable([
      detailRow("Class", event.classTitle),
      detailRow("Date", formatClassDate(event.date)),
      detailRow("Time", `${event.startTime}–${event.endTime}`),
      event.location ? detailRow("Location", event.location) : null,
    ])}
    <p>This class is currently full, but you're on the waiting list. If a spot opens up, Gabrielle will be in touch by email.</p>
    <p>— Gabrielle</p>`;

  return {
    subject: `You're on the waiting list — ${event.classTitle}`,
    html: emailLayout(body),
  };
};

export const waitlistJoinedAdmin: Template<EventOf<"waitlist-joined">> = (
  event,
) => ({
  subject: `[Moontide] New waitlist signup: ${event.classTitle} ${event.date}`,
  text: `New waitlist signup:\n\nCustomer: ${event.customerName} (${event.customerEmail})\nClass: ${event.classTitle}\nDate: ${event.date}\nTime: ${event.startTime}–${event.endTime}\n\nThere are now ${event.waitlistCount} ${event.waitlistCount === 1 ? "person" : "people"} on the waiting list for this class.\n\nView in admin: ${siteUrl("/admin/schedule")}`,
});

export const seatOfferedCustomer: Template<EventOf<"seat-offered">> = (
  event,
) => {
  const offerUrl = siteUrl(`/book/offer/${event.offerToken}`);

  const body = `
    <p>Hi ${event.customerName},</p>
    <p><strong>A place has come up in ${event.classTitle} — it's yours if you'd like it.</strong></p>
    ${detailTable([
      detailRow("Class", event.classTitle),
      detailRow("Date", formatClassDate(event.date)),
      detailRow("Time", `${event.startTime}–${event.endTime}`),
      event.location ? detailRow("Location", event.location) : null,
      detailRow("Held until", formatDeadline(event.expiresAt)),
    ])}
    <p>The seat is being held just for you until then.</p>
    <p><a href="${offerUrl}" style="display:inline-block;background:#ff7a2f;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Take this place</a></p>
    <p style="font-size:13px;color:#999;">Or paste this into your browser: ${offerUrl}</p>
    <p>— Gabrielle</p>`;

  return {
    subject: `A place has come up — ${event.classTitle}`,
    html: emailLayout(body),
  };
};

/**
 * The one note someone gets when their offer ran out unanswered: the seat has
 * gone back, and they are still on the waiting list for that class.
 *
 * Nothing goes out when Gabrielle withdraws an offer instead — she has already
 * spoken to that person herself, and a system message would contradict her.
 */
export const offerExpiredCustomer: Template<EventOf<"offer-expired">> = (
  event,
) => {
  const body = `
    <p>Hi ${event.customerName},</p>
    <p>We didn't hear back about the place we were holding for you, so it has gone back to the class.</p>
    ${detailTable([
      detailRow("Class", event.classTitle),
      detailRow("Date", formatClassDate(event.date)),
      detailRow("Time", `${event.startTime}–${event.endTime}`),
    ])}
    <p>Nothing has been taken from you, and you're still on the waiting list for this class — if another place comes up, Gabrielle will be in touch.</p>
    <p>— Gabrielle</p>`;

  return {
    subject: `The place we were holding — ${event.classTitle}`,
    html: emailLayout(body),
  };
};

// ---------------------------------------------------------------------- digest

/**
 * The one email a day that tells Gabrielle something is waiting on her.
 *
 * Plain text, like her other notifications, with a link into the admin page each
 * section is acted on from. Nothing sends an empty digest — see
 * `buildAdminDigest`: this arriving has to mean something.
 */
export const dailyDigestAdmin: Template<EventOf<"daily-digest">> = ({
  digest,
}) => {
  const { seatsToOffer, offersOutstanding, owedAClass } = digest;
  const sections: string[] = [];

  if (seatsToOffer.length > 0) {
    const lines = seatsToOffer.map(
      (seat) =>
        `- ${seat.classTitle}, ${formatDigestDay(seat.date)}, ${formatTime(seat.startTime)}–${formatTime(seat.endTime)}: ${seat.freeSeats} free ${seat.freeSeats === 1 ? "seat" : "seats"}, ${seat.waitingCount} ${seat.waitingCount === 1 ? "person" : "people"} waiting`,
    );
    sections.push(
      `FREE SEATS WITH PEOPLE WAITING (${seatsToOffer.length})\n\n${lines.join("\n")}\n\nOffer a seat: ${siteUrl("/admin/schedule")}`,
    );
  }

  if (offersOutstanding.length > 0) {
    const lines = offersOutstanding.map(
      (offer) =>
        `- ${offer.customerName} (${offer.customerEmail}) — ${offer.classTitle}, ${formatDigestDay(offer.date)}, ${formatTime(offer.startTime)} — held until ${formatDeadline(offer.expiresAt)}`,
    );
    sections.push(
      `OFFERS OUTSTANDING (${offersOutstanding.length})\n\n${lines.join("\n")}\n\nView or withdraw: ${siteUrl("/admin/schedule")}`,
    );
  }

  if (owedAClass.length > 0) {
    const lines = owedAClass.map(
      (booking) =>
        `- ${booking.customerName} (${booking.customerEmail}) — ${booking.classTitle}, ${formatDigestDay(booking.date)} — released ${booking.daysSince} days ago, not yet rescheduled`,
    );
    sections.push(
      `OWED A CLASS (${owedAClass.length})\n\n${lines.join("\n")}\n\nMove them onto a new date: ${siteUrl("/admin/bookings")}`,
    );
  }

  const total =
    seatsToOffer.length + offersOutstanding.length + owedAClass.length;

  return {
    subject: `[Moontide] ${total} ${total === 1 ? "thing needs" : "things need"} you`,
    text: `${sections.join("\n\n\n")}\n\nNothing here has been done for you — no places have been offered and no one has been moved.`,
  };
};

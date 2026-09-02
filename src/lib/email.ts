import { Resend } from "resend";
import type { AdminDigest } from "@/lib/waitlist/digest";

const resend = new Resend(process.env.RESEND_API_KEY);

interface ContactEmailParams {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export async function sendContactEmail(params: ContactEmailParams) {
  const { name, email, subject, message } = params;
  const to = process.env.CONTACT_EMAIL || "gwaring5@googlemail.com";

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to,
    subject: `[Moontide] ${subject}`,
    replyTo: email,
    text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
  });

  return { success: true };
}

export function buildEmailHtml(body: string): string {
  const logoUrl = `${process.env.BETTER_AUTH_URL}/images/moontide-logo.png`;
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f7f9fb;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f9fb;">
    <tr><td align="center" style="padding:24px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:#1e3a5f;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
          <img src="${logoUrl}" alt="Moontide" width="160" style="display:block;margin:0 auto;max-width:160px;height:auto;" />
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px 24px;font-size:16px;line-height:1.6;color:#2c3e50;">
          ${body}
        </td></tr>
        <tr><td style="padding:16px;text-align:center;font-size:12px;color:#999;">
          &copy; ${year} Moontide
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * How the seat was paid for. One discriminator, carried by both booking emails:
 * a card payment has a price to state, a credit has a balance. A booking funded
 * by a bundle credit must never be shown a cash price it did not pay, so the
 * two cannot be confused for one another by a caller that simply forgets.
 */
export type BookingPayment =
  | { method: "card"; priceInPence: number }
  | { method: "credit"; creditsRemaining: number };

/** "3 classes", "1 class" \u2014 the balance as the customer counts it. */
function classCount(credits: number) {
  return `${credits} ${credits === 1 ? "class" : "classes"}`;
}

interface BookingConfirmationParams {
  customerName: string;
  customerEmail: string;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
  payment: BookingPayment;
}

export async function sendBookingConfirmation(
  params: BookingConfirmationParams,
) {
  const {
    customerName,
    customerEmail,
    classTitle,
    date,
    startTime,
    endTime,
    location,
    payment,
  } = params;
  const cell = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#999;">${label}</td><td style="padding:4px 0;">${value}</td></tr>`;
  // The one place the two payment methods differ. A credit booking names the
  // credit and what it leaves; only a card booking states a price.
  const paymentRows =
    payment.method === "card"
      ? cell("Price", `\u00a3${(payment.priceInPence / 100).toFixed(2)}`)
      : cell("Paid with", "1 class credit from your bundle") +
        cell("Credits left", classCount(payment.creditsRemaining));
  const formattedDate = new Date(date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const body = `
    <p>Hi ${customerName},</p>
    <p><strong>Your class is booked!</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Class</td><td style="padding:4px 0;">${classTitle}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Date</td><td style="padding:4px 0;">${formattedDate}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Time</td><td style="padding:4px 0;">${startTime}\u2013${endTime}</td></tr>
      ${location ? cell("Location", location) : ""}
      ${paymentRows}
    </table>
    <p>See you there!</p>`;

  const html = buildEmailHtml(body);

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to: customerEmail,
    subject: `Your ${classTitle} class is booked — Moontide`,
    html,
  });

  return { success: true };
}

interface BundleConfirmationParams {
  customerEmail: string;
  bundleName: string;
  credits: number;
  expiryDate: string;
}

export async function sendBundleConfirmation(params: BundleConfirmationParams) {
  const { customerEmail, bundleName, credits, expiryDate } = params;

  const body = `
    <p>Hello,</p>
    <p><strong>Your ${bundleName} is ready to use!</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Bundle</td><td style="padding:4px 0;">${bundleName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Credits</td><td style="padding:4px 0;">${credits} classes</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Valid until</td><td style="padding:4px 0;">${expiryDate}</td></tr>
    </table>
    <p>Use this email address when booking classes to redeem your credits.</p>`;

  const html = buildEmailHtml(body);

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to: customerEmail,
    subject: `Your ${bundleName} is ready — Moontide`,
    html,
  });

  return { success: true };
}

interface WaitlistConfirmationParams {
  customerName: string;
  customerEmail: string;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
}

export async function sendWaitlistConfirmation(
  params: WaitlistConfirmationParams,
) {
  const {
    customerName,
    customerEmail,
    classTitle,
    date,
    startTime,
    endTime,
    location,
  } = params;
  const formattedDate = new Date(date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const body = `
    <p>Hi ${customerName},</p>
    <p><strong>You're on the waiting list for ${classTitle}.</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Class</td><td style="padding:4px 0;">${classTitle}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Date</td><td style="padding:4px 0;">${formattedDate}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Time</td><td style="padding:4px 0;">${startTime}–${endTime}</td></tr>
      ${location ? `<tr><td style="padding:4px 12px 4px 0;color:#999;">Location</td><td style="padding:4px 0;">${location}</td></tr>` : ""}
    </table>
    <p>This class is currently full, but you're on the waiting list. If a spot opens up, Gabrielle will be in touch by email.</p>
    <p>— Gabrielle</p>`;

  const html = buildEmailHtml(body);

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to: customerEmail,
    subject: `You're on the waiting list — ${classTitle}`,
    html,
  });

  return { success: true };
}

interface SeatOfferParams {
  customerName: string;
  customerEmail: string;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
  /** When the hold lapses — shown in London time, as the class is. */
  expiresAt: Date;
  offerUrl: string;
}

export async function sendSeatOffer(params: SeatOfferParams) {
  const {
    customerName,
    customerEmail,
    classTitle,
    date,
    startTime,
    endTime,
    location,
    expiresAt,
    offerUrl,
  } = params;

  const formattedDate = new Date(date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedDeadline = expiresAt.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  const body = `
    <p>Hi ${customerName},</p>
    <p><strong>A place has come up in ${classTitle} — it's yours if you'd like it.</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Class</td><td style="padding:4px 0;">${classTitle}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Date</td><td style="padding:4px 0;">${formattedDate}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Time</td><td style="padding:4px 0;">${startTime}–${endTime}</td></tr>
      ${location ? `<tr><td style="padding:4px 12px 4px 0;color:#999;">Location</td><td style="padding:4px 0;">${location}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Held until</td><td style="padding:4px 0;">${formattedDeadline}</td></tr>
    </table>
    <p>The seat is being held just for you until then.</p>
    <p><a href="${offerUrl}" style="display:inline-block;background:#ff7a2f;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Take this place</a></p>
    <p style="font-size:13px;color:#999;">Or paste this into your browser: ${offerUrl}</p>
    <p>— Gabrielle</p>`;

  const html = buildEmailHtml(body);

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to: customerEmail,
    subject: `A place has come up — ${classTitle}`,
    html,
  });

  return { success: true };
}

interface OfferExpiredParams {
  customerName: string;
  customerEmail: string;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * The one note someone gets when their offer ran out unanswered: the seat has
 * gone back, and they are still on the waiting list for that class.
 *
 * Nothing goes out when Gabrielle withdraws an offer instead — she has already
 * spoken to that person herself, and a system message would contradict her.
 */
export async function sendOfferExpired(params: OfferExpiredParams) {
  const { customerName, customerEmail, classTitle, date, startTime, endTime } =
    params;

  const formattedDate = new Date(date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const body = `
    <p>Hi ${customerName},</p>
    <p>We didn't hear back about the place we were holding for you, so it has gone back to the class.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Class</td><td style="padding:4px 0;">${classTitle}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Date</td><td style="padding:4px 0;">${formattedDate}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Time</td><td style="padding:4px 0;">${startTime}–${endTime}</td></tr>
    </table>
    <p>Nothing has been taken from you, and you're still on the waiting list for this class — if another place comes up, Gabrielle will be in touch.</p>
    <p>— Gabrielle</p>`;

  const html = buildEmailHtml(body);

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to: customerEmail,
    subject: `The place we were holding — ${classTitle}`,
    html,
  });

  return { success: true };
}

/**
 * The one email a day that tells Gabrielle something is waiting on her.
 *
 * Plain text, like her other notifications, with a link into the admin page each
 * section is acted on from. Callers must not send an empty digest — see
 * `buildAdminDigest`: this arriving has to mean something.
 */
export async function sendOfferDigest(digest: AdminDigest) {
  const { seatsToOffer, offersOutstanding, owedAClass } = digest;
  const to = process.env.CONTACT_EMAIL || "gwaring5@googlemail.com";
  const baseUrl = process.env.BETTER_AUTH_URL;

  const formatDay = (date: string) =>
    new Date(date).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  const formatDeadline = (deadline: Date) =>
    deadline.toLocaleString("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  const hhmm = (time: string) => time.slice(0, 5);

  const sections: string[] = [];

  if (seatsToOffer.length > 0) {
    const lines = seatsToOffer.map(
      (seat) =>
        `- ${seat.classTitle}, ${formatDay(seat.date)}, ${hhmm(seat.startTime)}–${hhmm(seat.endTime)}: ${seat.freeSeats} free ${seat.freeSeats === 1 ? "seat" : "seats"}, ${seat.waitingCount} ${seat.waitingCount === 1 ? "person" : "people"} waiting`,
    );
    sections.push(
      `FREE SEATS WITH PEOPLE WAITING (${seatsToOffer.length})\n\n${lines.join("\n")}\n\nOffer a seat: ${baseUrl}/admin/schedule`,
    );
  }

  if (offersOutstanding.length > 0) {
    const lines = offersOutstanding.map(
      (offer) =>
        `- ${offer.customerName} (${offer.customerEmail}) — ${offer.classTitle}, ${formatDay(offer.date)}, ${hhmm(offer.startTime)} — held until ${formatDeadline(offer.expiresAt)}`,
    );
    sections.push(
      `OFFERS OUTSTANDING (${offersOutstanding.length})\n\n${lines.join("\n")}\n\nView or withdraw: ${baseUrl}/admin/schedule`,
    );
  }

  if (owedAClass.length > 0) {
    const lines = owedAClass.map(
      (booking) =>
        `- ${booking.customerName} (${booking.customerEmail}) — ${booking.classTitle}, ${formatDay(booking.date)} — released ${booking.daysSince} days ago, not yet rescheduled`,
    );
    sections.push(
      `OWED A CLASS (${owedAClass.length})\n\n${lines.join("\n")}\n\nMove them onto a new date: ${baseUrl}/admin/bookings`,
    );
  }

  const total =
    seatsToOffer.length + offersOutstanding.length + owedAClass.length;

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to,
    subject: `[Moontide] ${total} ${total === 1 ? "thing needs" : "things need"} you`,
    text: `${sections.join("\n\n\n")}\n\nNothing here has been done for you — no places have been offered and no one has been moved.`,
  });

  return { success: true };
}

interface WaitlistNotificationParams {
  customerName: string;
  customerEmail: string;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  waitlistCount: number;
}

export async function sendWaitlistNotification(
  params: WaitlistNotificationParams,
) {
  const {
    customerName,
    customerEmail,
    classTitle,
    date,
    startTime,
    endTime,
    waitlistCount,
  } = params;
  const to = process.env.CONTACT_EMAIL || "gwaring5@googlemail.com";
  const adminUrl = `${process.env.BETTER_AUTH_URL}/admin/schedule`;

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to,
    subject: `[Moontide] New waitlist signup: ${classTitle} ${date}`,
    text: `New waitlist signup:\n\nCustomer: ${customerName} (${customerEmail})\nClass: ${classTitle}\nDate: ${date}\nTime: ${startTime}–${endTime}\n\nThere are now ${waitlistCount} ${waitlistCount === 1 ? "person" : "people"} on the waiting list for this class.\n\nView in admin: ${adminUrl}`,
  });

  return { success: true };
}

type BookingNotificationParams =
  | {
      type: "individual";
      customerName: string;
      customerEmail: string;
      classTitle: string;
      date: string;
      startTime: string;
      endTime: string;
      location: string | null;
      payment: BookingPayment;
    }
  | {
      type: "bundle";
      customerEmail: string;
      bundleName: string;
      credits: number;
      expiryDate: string;
    };

interface RescheduleNotificationParams {
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

export async function sendRescheduleNotification(
  params: RescheduleNotificationParams,
) {
  const {
    customerName,
    customerEmail,
    classTitle,
    oldDate,
    oldStartTime,
    oldEndTime,
    newDate,
    newStartTime,
    newEndTime,
    newLocation,
  } = params;

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const formattedOld = formatDate(oldDate);
  const formattedNew = formatDate(newDate);

  const body = `
    <p>Hi ${customerName},</p>
    <p><strong>Your booking has been moved to a new date.</strong></p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Class</td><td style="padding:4px 0;">${classTitle}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">From</td><td style="padding:4px 0;">${formattedOld}, ${oldStartTime}–${oldEndTime}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#999;">To</td><td style="padding:4px 0;">${formattedNew}, ${newStartTime}–${newEndTime}</td></tr>
      ${newLocation ? `<tr><td style="padding:4px 12px 4px 0;color:#999;">Location</td><td style="padding:4px 0;">${newLocation}</td></tr>` : ""}
    </table>
    <p>If this isn't right, please get in touch and we'll sort it out.</p>
    <p>— Gabrielle</p>`;

  const html = buildEmailHtml(body);

  await resend.emails.send({
    from: "Moontide <noreply@gabriellemoontide.co.uk>",
    to: customerEmail,
    subject: `Your booking has been moved — ${classTitle}`,
    html,
  });

  return { success: true };
}

export async function sendBookingNotification(
  params: BookingNotificationParams,
) {
  const to = process.env.CONTACT_EMAIL || "gwaring5@googlemail.com";

  if (params.type === "individual") {
    const {
      customerName,
      customerEmail,
      classTitle,
      date,
      startTime,
      endTime,
      location,
      payment,
    } = params;
    // She needs to know whether money came in for this seat or a credit was
    // spent on it — and if a credit, what the customer has left.
    const paid =
      payment.method === "card"
        ? `£${(payment.priceInPence / 100).toFixed(2)}`
        : `bundle credit (${classCount(payment.creditsRemaining)} left)`;
    await resend.emails.send({
      from: "Moontide <noreply@gabriellemoontide.co.uk>",
      to,
      subject: `[Moontide] New booking: ${classTitle}`,
      text: `New class booking:\n\nCustomer: ${customerName} (${customerEmail})\nClass: ${classTitle}\nDate: ${date}\nTime: ${startTime}–${endTime}${location ? `\nLocation: ${location}` : ""}\nPaid: ${paid}`,
    });
  } else {
    const { customerEmail, bundleName, credits, expiryDate } = params;
    await resend.emails.send({
      from: "Moontide <noreply@gabriellemoontide.co.uk>",
      to,
      subject: "[Moontide] New bundle purchase",
      text: `New bundle purchase:\n\nCustomer: ${customerEmail}\nBundle: ${bundleName}\nCredits: ${credits}\nExpires: ${expiryDate}`,
    });
  }

  return { success: true };
}

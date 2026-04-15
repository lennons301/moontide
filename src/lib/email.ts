import { Resend } from "resend";

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

interface BookingConfirmationParams {
  customerName: string;
  customerEmail: string;
  classTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string | null;
  priceInPence: number;
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
    priceInPence,
  } = params;
  const price = `\u00a3${(priceInPence / 100).toFixed(2)}`;
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
      ${location ? `<tr><td style="padding:4px 12px 4px 0;color:#999;">Location</td><td style="padding:4px 0;">${location}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#999;">Price</td><td style="padding:4px 0;">${price}</td></tr>
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
    }
  | {
      type: "bundle";
      customerEmail: string;
      bundleName: string;
      credits: number;
      expiryDate: string;
    };

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
    } = params;
    await resend.emails.send({
      from: "Moontide <noreply@gabriellemoontide.co.uk>",
      to,
      subject: `[Moontide] New booking: ${classTitle}`,
      text: `New class booking:\n\nCustomer: ${customerName} (${customerEmail})\nClass: ${classTitle}\nDate: ${date}\nTime: ${startTime}–${endTime}${location ? `\nLocation: ${location}` : ""}`,
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

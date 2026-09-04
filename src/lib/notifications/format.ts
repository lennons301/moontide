/**
 * Every shape a date, a name or a link takes in an email, defined once.
 *
 * The same `en-GB` options block was written out six times for a class date and
 * twice for an offer deadline, so a change to how Moontide writes a date meant
 * finding eight of them. There are three date questions and they are asked by
 * name — a fourth shape wants a fourth question here, not an options bag.
 *
 * `tests/lib/email-dates-are-one-place.test.ts` sweeps the server for `en-GB`
 * and allows it only here.
 */

const CLASS_DATE = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
} as const;

const DEADLINE = {
  // A hold lapses at a London wall clock, as the class it holds a seat on
  // starts at one. Vercel runs in UTC, so this must be said out loud.
  timeZone: "Europe/London",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
} as const;

const DIGEST_DAY = {
  weekday: "long",
  day: "numeric",
  month: "long",
} as const;

const BUNDLE_EXPIRY = {
  day: "numeric",
  month: "short",
  year: "numeric",
} as const;

/** "Friday 1 May 2026" — the date a customer email states a class is on. */
export function formatClassDate(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", CLASS_DATE);
}

/** "Friday 1 May, 18:00" — when a held seat goes back. */
export function formatDeadline(deadline: Date): string {
  return deadline.toLocaleString("en-GB", DEADLINE);
}

/**
 * "Friday 1 May" — the digest's compact line. It is a list of things happening
 * within days, so the year is noise rather than information.
 */
export function formatDigestDay(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", DIGEST_DAY);
}

/** "30 Jul 2026" — how long a bundle's credits last. */
export function formatBundleExpiry(expiresAt: Date): string {
  return new Date(expiresAt).toLocaleDateString("en-GB", BUNDLE_EXPIRY);
}

/** "09:00" — a schedule stores seconds nobody wants to read. */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/** "3 classes", "1 class" — a credit balance as the customer counts it. */
export function classCount(credits: number): string {
  return `${credits} ${credits === 1 ? "class" : "classes"}`;
}

/** A link into the site, for an email that asks someone to go and do something. */
export function siteUrl(path: string): string {
  return `${process.env.BETTER_AUTH_URL}${path}`;
}

/**
 * The branded shell every customer email sits in. Gabrielle's own copies are
 * plain text: they are working notes, not a piece of the website.
 */
export function emailLayout(body: string): string {
  const logoUrl = siteUrl("/images/moontide-logo.png");
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

/** One row of the little detail table every customer email carries. */
export function detailRow(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#999;">${label}</td><td style="padding:4px 0;">${value}</td></tr>`;
}

/** The detail table itself, with empty rows dropped. */
export function detailTable(rows: (string | null)[]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      ${rows.filter(Boolean).join("\n      ")}
    </table>`;
}

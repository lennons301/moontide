# Booking Confirmation Emails

## Summary

Send confirmation emails to customers after class bookings and bundle purchases, plus notification emails to Gabrielle. Emails are sent asynchronously via `waitUntil()` after the webhook DB write, with a cron retry for failures.

## Email Functions

Three new functions in `src/lib/email.ts`:

### `sendBookingConfirmation(params)`

HTML email to the customer after an individual class booking.

**Params:** `customerName`, `customerEmail`, `classTitle`, `date`, `startTime`, `endTime`, `location` (nullable), `priceInPence`

**Content:**
- Logo image: `${process.env.BETTER_AUTH_URL}/images/moontide-logo.png`
- "Hi {customerName},"
- "Your class is booked!"
- Class title, date, time, location (if set), price
- "See you there!"
- Moontide footer

### `sendBundleConfirmation(params)`

HTML email to the customer after a bundle purchase.

**Params:** `customerEmail`, `bundleName`, `credits`, `expiryDate` (formatted string)

**Content:**
- Logo image
- Greeting (no name — bundles only capture email)
- "Your {bundleName} is ready to use!"
- Credits available, expiry date
- "Use this email address when booking classes to redeem your credits."
- Moontide footer

### `sendBookingNotification(params)`

Plain text email to Gabrielle (`CONTACT_EMAIL`) for both booking types.

**For individual bookings:** customer name, email, class title, date, time, location

**For bundle purchases:** customer email, bundle name, credits, expiry date

**Subject line:** `[Moontide] New booking: {classTitle}` or `[Moontide] New bundle purchase`

## HTML Email Template

A shared `buildEmailHtml(body: string): string` function that wraps content in a branded layout:

- Inline CSS only (email client compatibility)
- Max-width 600px container, centered
- Deep-tide-blue (`#1e3a5f`) header with Moontide logo (`<img>` from `BETTER_AUTH_URL`)
- White content area with body text
- Muted footer: "© {year} Moontide" in small grey text
- Mobile-friendly (fluid width under 600px)

Booking and bundle confirmation functions call `buildEmailHtml()` with their specific body content.

## Webhook Integration

### Current flow (unchanged)

1. Stripe sends `checkout.session.completed` webhook
2. Webhook validates signature
3. DB transaction: insert booking/bundle row
4. Return 200 to Stripe

### New addition

5. After returning 200, use `waitUntil()` to send emails in the background
6. Send customer confirmation email
7. Send Gabrielle notification email
8. On success, update the row: `emailSent = true`

If the email send fails, the row keeps `emailSent = false` — the cron picks it up.

`waitUntil()` is imported from `next/server`. It keeps the serverless function alive after the response is sent, allowing background work without blocking the webhook response.

### Data needed for emails

**Individual bookings:** The webhook already has `customerName`, `customerEmail`, `scheduleId`, and `stripePaymentId` from Stripe metadata. To get class title, date, time, and location, it needs to query the schedule + class join. This query happens inside `waitUntil()` (after the response), not in the main webhook flow.

**Bundle purchases:** The webhook already has `customerEmail` and the bundle config (name, credits, expiryDays). The `expiresAt` date is calculated during the DB write. All data needed for the email is already in scope.

## Schema Changes

### `bookings` table

Add column: `emailSent` boolean, default `false`, not null.

### `bundles` table

Add column: `emailSent` boolean, default `false`, not null.

Migration applies `false` to existing rows.

## Cron Retry

### Endpoint: `POST /api/cron/retry-emails`

**Auth:** Checks `Authorization: Bearer <CRON_SECRET>` header. Returns 401 if missing or wrong.

**Logic:**
1. Query `bookings` where `emailSent = false` and `createdAt` within last 24 hours, joined with schedules and classes
2. Query `bundles` where `emailSent = false` and `purchasedAt` within last 24 hours, joined with bundleConfig
3. For each row, attempt to send confirmation + notification emails
4. On success, update `emailSent = true`
5. Return summary: `{ retriedBookings: N, retriedBundles: N, succeeded: N, failed: N }`

**Schedule:** Every 15 minutes via Vercel Cron.

**Vercel cron config** (in `vercel.json` or `vercel.ts`):
```json
{
  "crons": [
    {
      "path": "/api/cron/retry-emails",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

**24-hour cutoff:** Rows older than 24 hours are not retried. If emails still haven't been sent after 24 hours, Gabrielle can see them in admin and follow up manually.

## Admin Visibility

### Bookings page (`/admin/bookings`)

Show a small "email unsent" badge (e.g. orange dot or text) next to bookings where `emailSent = false`. No new column in the table — just a visual indicator alongside the existing status badge.

### Bundles page (`/admin/bundles`)

Same treatment — "email unsent" indicator where `emailSent = false`.

## Testing

- **Email function tests** (`tests/lib/email.test.ts`): Add tests for `sendBookingConfirmation`, `sendBundleConfirmation`, `sendBookingNotification`. Mock Resend, verify correct params are passed.
- **Webhook test updates** (`tests/api/stripe-webhook.test.ts`): Verify `waitUntil` is called after DB write. Verify `emailSent` is updated on success.
- **Cron endpoint tests** (`tests/api/cron-retry-emails.test.ts`): Test auth check, retry logic, emailSent flag updates.

## Out of Scope

- Email reminders before a class (future feature)
- Rich HTML templates with images/branding beyond the logo header
- Customer-facing email preferences/unsubscribe
- Cancellation emails

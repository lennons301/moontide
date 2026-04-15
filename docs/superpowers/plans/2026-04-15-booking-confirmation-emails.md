# Booking Confirmation Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send confirmation emails to customers and notifications to Gabrielle after class bookings and bundle purchases, with cron-based retry for delivery failures.

**Architecture:** Three email functions (booking confirmation, bundle confirmation, admin notification) called from the Stripe webhook via `waitUntil()`. An `emailSent` boolean on bookings/bundles tracks delivery. A cron endpoint retries failures every 15 minutes.

**Tech Stack:** Resend, Next.js `waitUntil()`, Vercel Cron, Drizzle ORM, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/db/schema.ts` | Modify | Add `emailSent` to bookings and bundles tables |
| `drizzle/migrations/XXXX_*.sql` | Create (generated) | Migration for new columns |
| `src/lib/email.ts` | Modify | Add `buildEmailHtml`, `sendBookingConfirmation`, `sendBundleConfirmation`, `sendBookingNotification` |
| `tests/lib/email.test.ts` | Modify | Add tests for new email functions |
| `src/app/api/stripe/webhook/route.ts` | Modify | Add `waitUntil()` email sending after DB write |
| `tests/api/stripe-webhook.test.ts` | Modify | Test waitUntil and emailSent flag |
| `src/app/api/cron/retry-emails/route.ts` | Create | Cron endpoint for retrying failed emails |
| `tests/api/cron-retry-emails.test.ts` | Create | Cron endpoint tests |
| `vercel.json` | Create | Cron schedule config |
| `src/app/admin/bookings/page.tsx` | Modify | Add email unsent indicator |
| `src/app/admin/bundles/page.tsx` | Modify | Add email unsent indicator |
| `AGENTS.md` | Modify | Document email functions, cron, and vercel.json |

---

### Task 1: Add emailSent column to schema

**Files:**
- Modify: `src/lib/db/schema.ts:100-111` (bookings table), `src/lib/db/schema.ts:78-87` (bundles table)

- [ ] **Step 1: Add emailSent to bookings table**

In `src/lib/db/schema.ts`, add `emailSent` to the `bookings` table definition. After the `createdAt` line (line 110), add:

```typescript
  emailSent: boolean("email_sent").default(false).notNull(),
```

- [ ] **Step 2: Add emailSent to bundles table**

In the `bundles` table definition, after the `status` line (line 86), add:

```typescript
  emailSent: boolean("email_sent").default(false).notNull(),
```

- [ ] **Step 3: Generate the migration**

Run: `doppler run -- pnpm exec drizzle-kit generate`
Expected: A new migration file adding `email_sent` columns to both tables.

- [ ] **Step 4: Apply the migration locally**

Run: `just db-migrate`
Expected: Migration applied successfully.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/
git commit -m "feat: add emailSent column to bookings and bundles tables"
```

---

### Task 2: HTML email template and email functions — tests

**Files:**
- Modify: `tests/lib/email.test.ts`

- [ ] **Step 1: Add tests for new email functions**

Append to `tests/lib/email.test.ts`, after the existing `sendContactEmail` describe block:

```typescript
import {
  buildEmailHtml,
  sendBookingConfirmation,
  sendBundleConfirmation,
  sendBookingNotification,
} from "@/lib/email";

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
```

Update the import at line 14 to also import the new functions (already handled by the new imports above — they're separate import statements).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/lib/email.test.ts`
Expected: FAIL — new functions don't exist yet.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/email.test.ts
git commit -m "test: add booking confirmation email tests"
```

---

### Task 3: HTML email template and email functions — implementation

**Files:**
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Add buildEmailHtml function**

Add after the existing `sendContactEmail` function in `src/lib/email.ts`:

```typescript
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
```

- [ ] **Step 2: Add sendBookingConfirmation function**

```typescript
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

export async function sendBookingConfirmation(params: BookingConfirmationParams) {
  const { customerName, customerEmail, classTitle, date, startTime, endTime, location, priceInPence } = params;
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
```

- [ ] **Step 3: Add sendBundleConfirmation function**

```typescript
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
```

- [ ] **Step 4: Add sendBookingNotification function**

```typescript
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

export async function sendBookingNotification(params: BookingNotificationParams) {
  const to = process.env.CONTACT_EMAIL || "gwaring5@googlemail.com";

  if (params.type === "individual") {
    const { customerName, customerEmail, classTitle, date, startTime, endTime, location } = params;
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm run test -- tests/lib/email.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: add booking confirmation and notification email functions"
```

---

### Task 4: Webhook integration with waitUntil

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`
- Modify: `tests/api/stripe-webhook.test.ts`

- [ ] **Step 1: Update webhook tests**

In `tests/api/stripe-webhook.test.ts`, add a mock for `waitUntil` and the email functions. Add to the hoisted block:

```typescript
  const mockWaitUntil = vi.fn();
```

Add a mock for `next/server`:

```typescript
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mockWaitUntil,
  };
});
```

Note: Next.js 15+ uses `after()` from `next/server` (not `waitUntil`). Add the import mock accordingly.

Add a mock for the email module:

```typescript
const mockSendBookingConfirmation = vi.fn().mockResolvedValue({ success: true });
const mockSendBundleConfirmation = vi.fn().mockResolvedValue({ success: true });
const mockSendBookingNotification = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: mockSendBookingConfirmation,
  sendBundleConfirmation: mockSendBundleConfirmation,
  sendBookingNotification: mockSendBookingNotification,
}));
```

Add these to `beforeEach`:

```typescript
mockWaitUntil.mockImplementation((promise: Promise<void>) => promise);
mockSendBookingConfirmation.mockResolvedValue({ success: true });
mockSendBundleConfirmation.mockResolvedValue({ success: true });
mockSendBookingNotification.mockResolvedValue({ success: true });
```

Update the individual booking test to verify `after` was called:

Add after the existing assertions:

```typescript
    // Verify after() was called for email sending
    expect(mockWaitUntil).toHaveBeenCalled();
```

Update the bundle purchase test similarly:

```typescript
    expect(mockWaitUntil).toHaveBeenCalled();
```

Add a new mock for the schedule+class query needed by the individual booking email. In the hoisted block, add:

```typescript
  const mockScheduleSelectWhere = vi.fn().mockResolvedValue([]);
  const mockScheduleSelectInnerJoin = vi.fn().mockReturnValue({ where: mockScheduleSelectWhere });
  const mockScheduleSelectFrom = vi.fn().mockReturnValue({ innerJoin: mockScheduleSelectInnerJoin });
  const mockScheduleSelect = vi.fn().mockReturnValue({ from: mockScheduleSelectFrom });
```

Update the DB mock's `select` to handle both bundle config and schedule lookups. The simplest approach: make the existing `mockBundleConfigSelect` handle both by resetting per-test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/api/stripe-webhook.test.ts`
Expected: FAIL — webhook doesn't call `after()` yet.

- [ ] **Step 3: Update the webhook route**

In `src/app/api/stripe/webhook/route.ts`:

Add imports at the top:

```typescript
import { after } from "next/server";
import { sendBookingConfirmation, sendBundleConfirmation, sendBookingNotification } from "@/lib/email";
```

Add `classes` to the schema import:

```typescript
import { bookings, bundleConfig, bundles, classes, schedules } from "@/lib/db/schema";
```

After the individual booking transaction (line 43), before the closing `}`, add:

```typescript
      after(async () => {
        try {
          const result = await db
            .select()
            .from(schedules)
            .innerJoin(classes, eq(schedules.classId, classes.id))
            .where(eq(schedules.id, scheduleId));

          if (result.length > 0) {
            const schedule = result[0].schedules;
            const classInfo = result[0].classes;

            await sendBookingConfirmation({
              customerName: metadata.customerName,
              customerEmail: metadata.customerEmail,
              classTitle: classInfo.title,
              date: schedule.date,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              location: schedule.location,
              priceInPence: classInfo.priceInPence,
            });

            await sendBookingNotification({
              type: "individual",
              customerName: metadata.customerName,
              customerEmail: metadata.customerEmail,
              classTitle: classInfo.title,
              date: schedule.date,
              startTime: schedule.startTime,
              endTime: schedule.endTime,
              location: schedule.location,
            });

            await db
              .update(bookings)
              .set({ emailSent: true })
              .where(eq(bookings.stripePaymentId, session.id));
          }
        } catch (error) {
          console.error("Failed to send booking confirmation email:", error);
        }
      });
```

After the bundle DB insert (line 71), before the closing `}`, add:

```typescript
      const expiryDateFormatted = expiresAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      after(async () => {
        try {
          await sendBundleConfirmation({
            customerEmail: metadata.customerEmail,
            bundleName: config.name,
            credits: config.credits,
            expiryDate: expiryDateFormatted,
          });

          await sendBookingNotification({
            type: "bundle",
            customerEmail: metadata.customerEmail,
            bundleName: config.name,
            credits: config.credits,
            expiryDate: expiryDateFormatted,
          });

          await db
            .update(bundles)
            .set({ emailSent: true })
            .where(eq(bundles.stripePaymentId, session.id));
        } catch (error) {
          console.error("Failed to send bundle confirmation email:", error);
        }
      });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- tests/api/stripe-webhook.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts tests/api/stripe-webhook.test.ts
git commit -m "feat: send confirmation emails via after() in webhook"
```

---

### Task 5: Cron retry endpoint — tests

**Files:**
- Create: `tests/api/cron-retry-emails.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/api/cron-retry-emails.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelectFrom, mockSelectWhere, mockSelectInnerJoin, mockUpdateSet, mockUpdateWhere } =
  vi.hoisted(() => {
    const mockSelectWhere = vi.fn().mockResolvedValue([]);
    const mockSelectInnerJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
    const mockSelectFrom = vi.fn().mockReturnValue({
      innerJoin: mockSelectInnerJoin,
      where: mockSelectWhere,
    });
    const mockUpdateWhere = vi.fn().mockResolvedValue([]);
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    return { mockSelectFrom, mockSelectWhere, mockSelectInnerJoin, mockUpdateSet, mockUpdateWhere };
  });

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", emailSent: "email_sent", createdAt: "created_at", stripePaymentId: "stripe_payment_id" },
  bundles: { id: "id", emailSent: "email_sent", purchasedAt: "purchased_at", stripePaymentId: "stripe_payment_id" },
  bundleConfig: { id: "id" },
  schedules: { id: "id", classId: "class_id" },
  classes: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  gte: vi.fn((...args: unknown[]) => args),
}));

const mockSendBookingConfirmation = vi.fn().mockResolvedValue({ success: true });
const mockSendBundleConfirmation = vi.fn().mockResolvedValue({ success: true });
const mockSendBookingNotification = vi.fn().mockResolvedValue({ success: true });

vi.mock("@/lib/email", () => ({
  sendBookingConfirmation: mockSendBookingConfirmation,
  sendBundleConfirmation: mockSendBundleConfirmation,
  sendBookingNotification: mockSendBookingNotification,
}));

import { POST } from "@/app/api/cron/retry-emails/route";

describe("POST /api/cron/retry-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
    mockSelectFrom.mockReturnValue({
      innerJoin: mockSelectInnerJoin,
      where: mockSelectWhere,
    });
    mockSelectWhere.mockResolvedValue([]);
    mockSelectInnerJoin.mockReturnValue({ where: mockSelectWhere });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
  });

  it("returns 401 without valid authorization", async () => {
    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 200 with summary when no pending emails", async () => {
    mockSelectWhere.mockResolvedValue([]);

    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.retriedBookings).toBe(0);
    expect(body.retriedBundles).toBe(0);
  });

  it("retries failed booking emails and updates emailSent", async () => {
    mockSelectFrom
      .mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                bookings: {
                  id: 1,
                  customerName: "Jane Doe",
                  customerEmail: "jane@example.com",
                  stripePaymentId: "cs_test_1",
                },
                schedules: { date: "2026-05-01", startTime: "09:00", endTime: "10:00", location: "Studio 1" },
                classes: { title: "Prenatal Yoga", priceInPence: 1250 },
              },
            ]),
          }),
        }),
      })
      .mockReturnValueOnce({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

    const request = new Request("http://localhost:3000/api/cron/retry-emails", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mockSendBookingConfirmation).toHaveBeenCalled();
    expect(mockSendBookingNotification).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/api/cron-retry-emails.test.ts`
Expected: FAIL — route doesn't exist.

- [ ] **Step 3: Commit**

```bash
git add tests/api/cron-retry-emails.test.ts
git commit -m "test: add cron retry emails endpoint tests"
```

---

### Task 6: Cron retry endpoint — implementation

**Files:**
- Create: `src/app/api/cron/retry-emails/route.ts`

- [ ] **Step 1: Create the cron endpoint**

Create `src/app/api/cron/retry-emails/route.ts`:

```typescript
import { and, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, bundleConfig, bundles, classes, schedules } from "@/lib/db/schema";
import {
  sendBookingConfirmation,
  sendBundleConfirmation,
  sendBookingNotification,
} from "@/lib/email";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - 24);

  let succeededBookings = 0;
  let succeededBundles = 0;
  let failed = 0;

  // Retry unsent booking emails
  const pendingBookings = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(and(eq(bookings.emailSent, false), gte(bookings.createdAt, cutoff)));

  for (const row of pendingBookings) {
    try {
      await sendBookingConfirmation({
        customerName: row.bookings.customerName,
        customerEmail: row.bookings.customerEmail,
        classTitle: row.classes.title,
        date: row.schedules.date,
        startTime: row.schedules.startTime,
        endTime: row.schedules.endTime,
        location: row.schedules.location,
        priceInPence: row.classes.priceInPence,
      });

      await sendBookingNotification({
        type: "individual",
        customerName: row.bookings.customerName,
        customerEmail: row.bookings.customerEmail,
        classTitle: row.classes.title,
        date: row.schedules.date,
        startTime: row.schedules.startTime,
        endTime: row.schedules.endTime,
        location: row.schedules.location,
      });

      await db
        .update(bookings)
        .set({ emailSent: true })
        .where(eq(bookings.id, row.bookings.id));

      succeededBookings++;
    } catch (error) {
      console.error(`Failed to retry booking email for booking ${row.bookings.id}:`, error);
      failed++;
    }
  }

  // Retry unsent bundle emails
  const pendingBundles = await db
    .select()
    .from(bundles)
    .innerJoin(bundleConfig, eq(bundles.creditsTotal, bundleConfig.credits))
    .where(and(eq(bundles.emailSent, false), gte(bundles.purchasedAt, cutoff)));

  for (const row of pendingBundles) {
    try {
      const expiryDate = new Date(row.bundles.expiresAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      await sendBundleConfirmation({
        customerEmail: row.bundles.customerEmail,
        bundleName: row.bundle_config.name,
        credits: row.bundle_config.credits,
        expiryDate,
      });

      await sendBookingNotification({
        type: "bundle",
        customerEmail: row.bundles.customerEmail,
        bundleName: row.bundle_config.name,
        credits: row.bundle_config.credits,
        expiryDate,
      });

      await db
        .update(bundles)
        .set({ emailSent: true })
        .where(eq(bundles.id, row.bundles.id));

      succeededBundles++;
    } catch (error) {
      console.error(`Failed to retry bundle email for bundle ${row.bundles.id}:`, error);
      failed++;
    }
  }

  return NextResponse.json({
    retriedBookings: pendingBookings.length,
    retriedBundles: pendingBundles.length,
    succeeded: succeededBookings + succeededBundles,
    failed,
  });
}
```

**Note:** The bundle retry joins `bundles` with `bundleConfig` to get the bundle name. The join condition `eq(bundles.creditsTotal, bundleConfig.credits)` is a heuristic — if there's only one bundle config (current state), this works. The implementer should check the actual Drizzle join result key for `bundleConfig` — it may be `bundle_config` (snake_case table name) in the result object. Adjust field access accordingly.

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm run test -- tests/api/cron-retry-emails.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/retry-emails/route.ts
git commit -m "feat: add cron endpoint for retrying failed confirmation emails"
```

---

### Task 7: Vercel cron config

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create vercel.json**

Create `vercel.json` in the project root:

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

- [ ] **Step 2: Add CRON_SECRET to .env.example**

In `.env.example`, add:

```
CRON_SECRET=
```

- [ ] **Step 3: Commit**

```bash
git add vercel.json .env.example
git commit -m "feat: add Vercel cron config for email retry (every 15 min)"
```

---

### Task 8: Admin email unsent indicators

**Files:**
- Modify: `src/app/admin/bookings/page.tsx`
- Modify: `src/app/admin/bundles/page.tsx`

- [ ] **Step 1: Update bookings page**

In `src/app/admin/bookings/page.tsx`, add `emailSent` to the `BookingRow` interface (line 6). After `createdAt: string;`, add:

```typescript
    emailSent: boolean;
```

In the table body, after the status badge cell (around line 141-143), add a visual indicator. Replace the status cell:

```tsx
                  <td className="px-4 py-3">
                    {statusBadge(item.bookings.status)}
                    {!item.bookings.emailSent && (
                      <span className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-bright-orange/20 text-bright-orange">
                        email unsent
                      </span>
                    )}
                  </td>
```

- [ ] **Step 2: Update bundles page**

In `src/app/admin/bundles/page.tsx`, add `emailSent` to the `Bundle` interface (line 5). After `status: string;`, add:

```typescript
  emailSent: boolean;
```

In the table body, after the status badge cell (around line 103), update:

```tsx
                  <td className="px-4 py-3">
                    {statusBadge(bundle.status)}
                    {!bundle.emailSent && (
                      <span className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-bright-orange/20 text-bright-orange">
                        email unsent
                      </span>
                    )}
                  </td>
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/bookings/page.tsx src/app/admin/bundles/page.tsx
git commit -m "feat: show email unsent indicator in admin bookings and bundles"
```

---

### Task 9: Update documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update AGENTS.md**

Add to the project structure, under `api/`:

```
      cron/
        retry-emails/     # Cron: retry unsent confirmation emails (every 15 min)
```

Add to Key Conventions:

```
- **Confirmation emails:** Sent via Resend after Stripe webhook using `after()`. Customer gets HTML confirmation, Gabrielle gets plain text notification. `emailSent` flag on bookings/bundles tracks delivery; cron retries failures every 15 min.
- **Vercel Cron:** Configured in `vercel.json`. Cron endpoints at `/api/cron/*` are protected by `CRON_SECRET` bearer token.
```

Update the Commands section to note vercel.json:

```
- **Vercel config:** `vercel.json` — cron schedules for email retry
```

- [ ] **Step 2: Run full test suite and lint**

Run: `pnpm run test && pnpm exec biome check --write .`
Expected: All tests pass, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with email confirmation and cron docs"
```

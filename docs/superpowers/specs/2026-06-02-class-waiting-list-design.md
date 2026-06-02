# Class Waiting List

## Summary

Allow customers to join a waiting list when a class is full, and give Gabrielle a per-schedule view of waitlist entries in the admin so she can manually contact people when a slot opens (e.g. after a cancellation). No payment is taken at the waitlist point — if someone is offered a slot, they book and pay through the existing checkout flow.

## Background and current behaviour

Today, full classes simply disappear from `/book` — the page query filters `schedules.status = "open"`, and the checkout endpoint returns a 400 (`"Class is full"`) if `bookedCount >= capacity`. There is no path for an interested customer to express interest in a full class.

The schema already anticipates this work in two small ways:
- `bookingStatus` enum includes a `waitlisted` value (currently unused).
- `scheduleStatus` enum includes a `full` value (set manually by admin via `/admin/schedule`).
- The admin bookings page already includes a `waitlisted` badge style (currently unused).

This design adds a dedicated `waitlist_entries` table rather than overloading `bookings`, keeping "a booking" semantically equal to "a paid/credited seat". The unused enum value remains in place but is not consumed by this work.

## Data model

A new Drizzle table in `src/lib/db/schema.ts`:

```ts
export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id")
      .references(() => schedules.id, { onDelete: "cascade" })
      .notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    emailSent: boolean("email_sent").default(false).notNull(),
  },
  (table) => ({
    scheduleEmailUnique: uniqueIndex("waitlist_schedule_email_idx").on(
      table.scheduleId,
      table.customerEmail,
    ),
  }),
);
```

- `onDelete: "cascade"` so removing a schedule cleans up its waitlist.
- The unique index on `(scheduleId, customerEmail)` prevents the same person joining the same class's waitlist twice. The API treats a duplicate insert as success (idempotent) so we don't leak whether someone is already on the list.
- `emailSent` mirrors the existing flag on `bookings`/`bundles` for future symmetry; v1 sets it but no cron retries waitlist emails.

Migration generated via `just db-generate` and committed alongside the schema change.

## Customer flow

### Listing page (`src/app/book/page.tsx`)

Change the upcoming schedules query to include `full` schedules:

```ts
.where(
  and(
    gte(schedules.date, today),
    inArray(schedules.status, ["open", "full"]),
  ),
)
```

This still excludes `cancelled`.

### Booking client (`src/app/book/booking-client.tsx`)

A schedule is "full" when `bookedCount >= capacity` OR `status === "full"`. Compute via a small helper:

```ts
const isScheduleFull = (s: ScheduleRow["schedules"]) =>
  s.status === "full" || s.bookedCount >= s.capacity;
```

**Per-date class list:**
- Open schedule with spots → existing button + "X spots left" (unchanged).
- Full schedule → same row layout, but the right-hand CTA reads **"Class full · Join waiting list →"** with reduced visual emphasis (no red "X spots left", no price highlight).

**Selected schedule view:**
- When `selected` is a full schedule, render a stripped-down form: name + email only. No "I have a bundle" checkbox. No price box. Submit button reads **"Join waiting list"**.
- Submits to `POST /api/book/waitlist` with `{ scheduleId, customerName, customerEmail }`.
- On success → `window.location.href = "/book/confirmation?type=waitlist"`.
- On 400/500 → inline error in the form, same pattern as the existing checkout error handling.

### Confirmation page (`src/app/book/confirmation/page.tsx`)

Add a new branch for `type=waitlist`:

> **You're on the waiting list.**
> We'll be in touch by email if a spot opens. In the meantime, browse other upcoming classes.

Includes a link back to `/book`. No booking reference, no payment summary.

## API endpoint

New route: `src/app/api/book/waitlist/route.ts`.

```
POST /api/book/waitlist
Body: { scheduleId: number, customerName: string, customerEmail: string }
```

**Logic:**
1. Validate required fields → 400 `"Missing required fields"` if any are missing or blank.
2. Load schedule + class via `db.select().from(schedules).innerJoin(classes, …).where(eq(schedules.id, scheduleId))`. If empty → 404 `"Schedule not found"`.
3. If `schedule.status === "cancelled"` → 400 `"Class is not available"`.
4. If schedule still has spots (`schedule.status !== "full" && schedule.bookedCount < schedule.capacity`) → 400 `"Class still has spots — please book normally"`. Guards against stale clients.
5. Insert into `waitlistEntries`. Catch unique-constraint violations on `(scheduleId, customerEmail)` and treat as success (no-op).
6. Inside an `after(() => …)` block (from `next/server`), send both emails and update `emailSent = true` only if both succeed. Failures are logged but do not affect the response.
7. Return `{ ok: true }` (status 200).

Public route — no auth, same posture as `/api/book/checkout` and `/api/book/redeem`.

## Emails

Two new functions added to `src/lib/email.ts`, reusing the existing `buildEmailHtml()` helper for the customer-facing one.

### `sendWaitlistConfirmation(params)` — to customer

HTML email, branded layout (logo + footer via `buildEmailHtml`).

**Params:** `customerName`, `customerEmail`, `classTitle`, `date`, `startTime`, `endTime`, `location` (nullable)

**Subject:** `You're on the waiting list — {classTitle}`

**Body:**
- "Hi {customerName},"
- "Thanks for your interest in **{classTitle}** on **{date}** at **{startTime}–{endTime}**{location ? ` · ${location}` : ""}."
- "This class is currently full, but you're on the waiting list. If a spot opens up, Gabrielle will be in touch by email."
- "— Gabrielle"

### `sendWaitlistNotification(params)` — to Gabrielle

Plain text email, recipient is `process.env.CONTACT_EMAIL` (same default fallback as existing `sendBookingNotification`).

**Params:** `customerName`, `customerEmail`, `classTitle`, `date`, `startTime`, `endTime`, `waitlistCount`

**Subject:** `[Moontide] New waitlist signup — {classTitle} {date}`

**Body (plain text):**
```
New waitlist signup:

{customerName} <{customerEmail}>

Class: {classTitle}
Date: {date}
Time: {startTime}–{endTime}

There are now {waitlistCount} people on the waiting list for this class.

View in admin: {BETTER_AUTH_URL}/admin/schedule
```

Both functions are called from the new `/api/book/waitlist` route within an `after()` block. `emailSent = true` is set only when both calls resolve without throwing. No retry job — admin UI is the fallback signal.

## Admin UI

### Schedules API (`src/app/api/admin/schedules/route.ts`)

The GET response gains a per-schedule `waitlistCount` (number). Implementation: a single grouped query, e.g.

```ts
const counts = await db
  .select({
    scheduleId: waitlistEntries.scheduleId,
    count: sql<number>`count(*)::int`,
  })
  .from(waitlistEntries)
  .groupBy(waitlistEntries.scheduleId);
```

…then mapped onto the schedule rows. `waitlistCount` defaults to `0` when no entries exist for a schedule.

### Schedule page (`src/app/admin/schedule/page.tsx`)

For each schedule row where `waitlistCount > 0`, render a small chip alongside the existing status/actions:

```
Waitlist (N)
```

Tapping the chip opens the waitlist panel for that schedule. Rows with `waitlistCount === 0` show nothing — no noise. The chip uses the existing `ocean-light-blue` accent for visual consistency with the unused `waitlisted` booking badge.

### Waitlist panel (`src/app/admin/schedule/waitlist-panel.tsx`)

A new client component rendered as a shadcn `Sheet` (sliding in from the right), matching the existing `mobile-menu.tsx` pattern.

- **Header:** "Waiting list — {classTitle}, {formattedDate}"
- **Body:**
  - Loading state while fetching.
  - Empty state: "Nobody on the waiting list yet." (Reachable only if all entries were just removed; otherwise the chip wouldn't have opened.)
  - List of entries ordered by `createdAt ASC` (first-joined first). Each row shows:
    - Name (heading)
    - Email as a `mailto:` link
    - "Joined Xd ago" relative timestamp
    - A `Remove` button (text-style, red on hover)
- **Remove flow:** `window.confirm("Remove this person from the waiting list?")` → `DELETE /api/admin/waitlist?id=N` → on success, re-fetch the list. After removal, if the list becomes empty, the panel stays open showing the empty state.

### Admin API (`src/app/api/admin/waitlist/route.ts`)

```
GET /api/admin/waitlist?scheduleId=N
DELETE /api/admin/waitlist?id=N
```

- `GET` returns `Array<{ id, scheduleId, customerName, customerEmail, createdAt }>` ordered by `createdAt ASC`. Returns 400 if `scheduleId` missing or not numeric.
- `DELETE` removes the row by id. Returns 200 on success, 404 if not found.
- No in-route auth check — relies on the `/admin/*` proxy (same convention as the other `/api/admin/*` routes).

## Bundle holders

Bundle holders join the waitlist the same way as everyone else: name + email, no credit deducted, no special UI marker. If they're later offered a slot, they redeem a credit through the existing `/api/book/redeem` flow at that point. This means no refund/hold logic and no changes to bundle code paths.

## Tests

All new tests follow the existing Vitest + mocks pattern; no DB hits in CI.

### `tests/api/book-waitlist.test.ts` (new)

- 400 on missing `customerName` / `customerEmail` / `scheduleId`.
- 404 on unknown `scheduleId`.
- 400 when schedule is `cancelled`.
- 400 when schedule still has spots (open + `bookedCount < capacity`).
- 200 + insert + both emails fired when schedule is `status="full"`.
- 200 + insert + both emails fired when schedule has `bookedCount >= capacity` (even with status="open").
- 200 + no duplicate insert when the same email submits twice for the same schedule.
- `emailSent = true` set only after both email calls resolve.

### `tests/admin/waitlist.test.ts` (new)

- GET without `scheduleId` → 400.
- GET with valid `scheduleId` returns entries ordered by `createdAt ASC`.
- DELETE removes the row and returns 200.
- DELETE on a non-existent id returns 404.

### `tests/admin/schedules.test.ts` (extend)

- Assert the GET response includes `waitlistCount` on each schedule row.
- Assert `waitlistCount` defaults to `0` when no entries exist.

### `tests/lib/email.test.ts` (extend)

- `sendWaitlistConfirmation` calls Resend with the customer email and a subject matching `You're on the waiting list`.
- `sendWaitlistNotification` calls Resend with the `CONTACT_EMAIL` recipient and a subject matching `[Moontide] New waitlist signup`.

## Out of scope (v1)

- No email retry cron for waitlist signups (the existing daily retry job covers bookings/bundles only; manual visibility in admin is the fallback).
- No automated "slot freed → email waitlist" — admin contacts people manually, as specified.
- No position-on-waiting-list shown to customers.
- No removal of the unused `bookingStatus.waitlisted` enum value.
- No top-level `/admin/waitlist` overview page — per-schedule panel only.
- No "no waitlist yet" chip on `status=full` schedules with zero entries; chip appears only when count > 0.

# Admin Booking Reschedule

## Summary

Let the admin move a booking from one schedule to another, instead of being forced into the cancel-and-refund path when a class needs to be moved or a customer wants a different date. Bundle bookings and Stripe-paid bookings are treated identically — moving a booking doesn't touch credits or payments, just changes which schedule the booking points at.

Scope is admin-only and one booking at a time. Customer self-service (magic-link auth) and bulk multi-select are explicitly deferred — when bulk lands later it'll be checkbox multi-select, not "reschedule all".

## Background and current behaviour

Today the admin's only options on a booking are: leave it alone, or cancel it. Cancelling decrements the schedule's `bookedCount`, but does NOT refund Stripe or restore bundle credits — refunds are manual in Stripe; bundle credits are non-restorable by design. The admin's confirm dialog explicitly says "refund and notify customers separately".

A class can already be cancelled while it has active bookings on it. The cancel handler sets `schedules.status = "cancelled"`, the public `/book` page filters its listing to `status IN ('open', 'full')` so customers can no longer book it, but existing bookings stay attached to the cancelled schedule with `status = "confirmed"`. They're orphaned until the admin handles them out-of-band.

This work adds the missing third option: move a booking to a different schedule of the same class. The cancel-class flow is unchanged in code, but its confirm-dialog copy gains a nudge toward the new option.

## Data model

Two nullable columns added to `bookings` in `src/lib/db/schema.ts`:

```ts
export const bookings = pgTable("bookings", {
  // ... existing fields ...
  originalScheduleId: integer("original_schedule_id").references(() => schedules.id),
  rescheduledAt: timestamp("rescheduled_at"),
});
```

- `originalScheduleId` — set the **first** time a booking is rescheduled, points at the booking's very-first schedule. Subsequent reschedules do **not** overwrite it. Captures "this booking originated here" for audit/UX purposes.
- `rescheduledAt` — set on every reschedule (overwritten by later moves). Most-recent move timestamp.
- Both nullable so never-rescheduled bookings have both `null`. Existing rows are unaffected.
- FK uses Drizzle's default `onDelete: "no action"` so the original schedule can't be deleted while bookings still reference it. The schedule delete handler already blocks deletion when any bookings exist, so this is belt-and-braces.

Migration generated via `pnpm exec drizzle-kit generate`. Pure additive — no destructive changes to existing data.

## API: extend `PUT /api/admin/bookings`

`src/app/api/admin/bookings/route.ts` already has a PUT handler that accepts `{ id, status: "cancelled" }`. We add a parallel branch for `{ id, newScheduleId }`.

**Request shape:**

```
PUT /api/admin/bookings
Body: { id: number, newScheduleId: number }   // reschedule
   or { id: number, status: "cancelled" }     // existing cancel — untouched
```

The handler picks the branch based on which field is present. If neither is supplied → 400 `"Missing required fields"`.

**Reschedule branch** (atomic in `db.transaction`):

1. Load booking by `id`. 404 `"Booking not found"` if not found.
2. 400 `"Cannot reschedule a cancelled booking"` if `booking.status === "cancelled"`.
3. Load source schedule (via `booking.scheduleId`).
4. Load target schedule (via `newScheduleId`). 404 `"Target schedule not found"` if missing.
5. 400 `"Cannot reschedule to a different class"` if `target.classId !== source.classId`.
6. 400 `"Target class is cancelled"` if `target.status === "cancelled"`.
7. 400 `"Booking is already on that schedule"` if `newScheduleId === booking.scheduleId`.
8. 400 `"Target class is full"` if `target.bookedCount >= target.capacity`.
9. Inside the transaction:
   - Update booking:
     - `scheduleId = newScheduleId`
     - `rescheduledAt = NOW()`
     - `originalScheduleId = COALESCE(originalScheduleId, source.id)` — set on first move only, preserved on subsequent moves.
   - Decrement source `bookedCount` (`GREATEST(bookedCount - 1, 0)`).
   - Increment target `bookedCount`.
10. After commit, in an `after()` block (from `next/server`): call `sendRescheduleNotification` with the customer name + email + old class/date/time + new class/date/time/location. Failures are logged but don't fail the response.
11. Return `{ success: true }`.

**Cancel branch:** unchanged.

**No Stripe interaction, no bundle credit change** — a reschedule moves a single booking from one schedule to another. The seat count is preserved overall (one less at source, one more at target). Bundle credits were consumed at original booking time and stay consumed.

## Email helper

A new function in `src/lib/email.ts`:

### `sendRescheduleNotification(params)`

HTML email to the customer, branded via the existing `buildEmailHtml()` wrapper.

**Params:**
- `customerName: string`
- `customerEmail: string`
- `classTitle: string`
- `oldDate: string`
- `oldStartTime: string`
- `oldEndTime: string`
- `newDate: string`
- `newStartTime: string`
- `newEndTime: string`
- `newLocation: string | null`

**Subject:** `Your booking has been moved — {classTitle}`

**Body:**
- "Hi {customerName},"
- "**Your booking has been moved to a new date.**"
- Two-row table showing **From** (old date + time) and **To** (new date + time + optional location).
- "If this isn't right, please get in touch and we'll sort it out."
- "— Gabrielle"

Called from the reschedule branch of `/api/admin/bookings` PUT inside `after()`. The wording is initiator-agnostic so it'll still work when customer self-service lands later.

## Admin UI

Only `src/app/admin/bookings/page.tsx` and `src/app/admin/schedule/page.tsx` change.

### Bookings page — new "Reschedule" row action

In the Actions column, add a "Reschedule" button next to the existing "Cancel" button. Both are gated on `booking.status === "confirmed"`. Past-date bookings still show it — admin might legitimately want to move a no-show to a future date.

Clicking the button opens a shadcn `Sheet` (same primitive used by the waitlist panel — consistent UX):

**Header:**
- Title: `Reschedule — {customerName} → {classTitle}`
- Sub-line: `Currently on {formattedOldDate}, {oldStartTime}–{oldEndTime}`

**Body:**
- Label: `Move to:`
- List of eligible target schedules as buttons. Eligible = `classId === source.classId AND status !== "cancelled" AND date >= today AND id !== source.scheduleId AND bookedCount < capacity`.
- Each row shows the date, start–end times, location (if any), and `X spots left` on the right. Clicking commits the move.
- Empty state: `"No other dates available for this class. Add a new schedule first, then come back."`
- On API error: inline error message at the top of the body. Sheet stays open so admin can retry or pick another target.

**Data fetching:**
- Bookings page already fetches `/api/admin/classes` for the class filter. Now also fetches `/api/admin/schedules` once on mount (cheap — same admin user, same data) and the Sheet computes its eligible list client-side from that.
- After a successful reschedule, the Sheet closes and the bookings list re-fetches so the row reflects its new schedule date/time.

**Reschedule indicator:**
- For rows where `booking.rescheduledAt !== null`, render a small "moved" chip next to the Date cell. Visual style: `bg-soft-moonstone/30 text-deep-ocean text-xs rounded-full px-2 py-0.5`. The chip's `title` attribute (native tooltip) reads `"Moved on {formattedRescheduledAt}"`. The current schedule's date is already shown in the cell next to the chip; the original date isn't displayed in v1 because surfacing it would require joining `bookings.originalScheduleId` back to `schedules` in the GET response — defer that lookup until there's a real need.

### Schedule page — confirm-dialog copy tweak

`handleCancelClass` in `src/app/admin/schedule/page.tsx` currently calls `window.confirm` with:

> "Cancel this class? It will be hidden from the public calendar. Existing bookings remain — refund and notify customers separately."

Update to:

> "Cancel this class? It will be hidden from the public calendar. Existing bookings remain — reschedule them individually from the Bookings page, or refund and notify customers separately."

One-string change. The cancel handler itself is unchanged.

### No other admin pages change

The admin home, pricing, bundles, messages, waitlist panel — none are touched.

## Tests

Following the project's Vitest + hoisted-Drizzle-mocks pattern. No DB hits in CI.

### `tests/admin/bookings.test.ts` (new)

No test file exists for the bookings PUT today — we add one and cover both branches (cancel as regression, reschedule as new).

**General:**
- 400 when neither `status` nor `newScheduleId` is supplied.
- 400 when `id` is missing.

**Cancel branch (regression):**
- 404 when booking not found.
- 400 when booking is already cancelled.
- 200 on success: booking status updated, `bookedCount` decremented.

**Reschedule branch:**
- 404 when booking not found.
- 400 when booking is cancelled.
- 404 when target schedule not found.
- 400 when target schedule is `status === "cancelled"`.
- 400 when target schedule's `classId` differs from source's.
- 400 when target schedule is at capacity (`bookedCount >= capacity`).
- 400 when target equals source (`newScheduleId === booking.scheduleId`).
- 200 on first move: assert booking's `scheduleId` updated, `rescheduledAt` set, `originalScheduleId = source.id`, source `bookedCount` decremented, target `bookedCount` incremented, `sendRescheduleNotification` called.
- 200 on second move: assert `originalScheduleId` is **not** overwritten (still points at the very-first source), `rescheduledAt` updated to now.

### `tests/lib/email.test.ts` (extend)

- One new case: `sendRescheduleNotification` returns `{ success: true }` (mirrors the pattern for the existing helpers — the Resend client is globally mocked).

### No other test files touched

`tests/admin/schedules.test.ts` — unaffected, no schedules API changes.
`tests/admin/messages.test.ts`, `tests/admin/waitlist.test.ts`, `tests/components/admin/use-table-controls.test.ts` — unaffected.

## Out of scope

- **No customer self-service reschedule.** Magic-link auth, signed booking-reference tokens, public reschedule page — all deferred.
- **No bulk reschedule.** Future bulk will be checkbox multi-select on the bookings table, not "reschedule all".
- **No cross-class moves.** The picker is locked to `target.classId === source.classId`.
- **No automated Stripe refund integration.** Refunds remain a manual Stripe-dashboard action — unchanged.
- **No bundle credit accounting on reschedule.** Credits stay where they are.
- **No fix for orphaned waitlist entries on cancelled schedules.** Pre-existing minor gap; flag as a follow-up.
- **No toast notification system.** Sheet closes on success; the list refresh is the user-visible confirmation.
- **No "Reschedule" gating on past-date bookings.** Admin can move a no-show forward; harmless.
- **No URL state on the reschedule Sheet.** Closed by default, opens on click, doesn't deep-link.
- **No reschedule history beyond the one-row audit.** The lightweight columns capture first-source + last-move timestamp only. Full history (multi-move) lives in admin's memory / logs.
- **No customer-facing surface of the audit fields.** `originalScheduleId` and `rescheduledAt` are admin-only data.

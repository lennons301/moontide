# Admin Booking Reschedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin move a single confirmed booking to a different schedule of the same class via a row-level action on the Bookings page, with an email notification to the customer and a lightweight two-column audit trail.

**Architecture:** Two nullable columns added to `bookings` (`originalScheduleId`, `rescheduledAt`). The existing `PUT /api/admin/bookings` route gains a parallel branch for `{ id, newScheduleId }` that runs an atomic transaction (update booking + decrement source `bookedCount` + increment target `bookedCount`) and sends a Resend email in an `after()` block. The Bookings admin page adds a row-level Reschedule button that opens a shadcn `Sheet` listing eligible target schedules. The Schedule page's cancel-confirm copy gets a one-line update mentioning reschedule as an alternative.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle 0.45 on Postgres, Resend, shadcn `Sheet`, Vitest 4 (Node environment).

**Spec:** `docs/superpowers/specs/2026-06-05-admin-booking-reschedule-design.md`

**Branch:** `feat/admin-booking-reschedule` (already checked out, spec committed at HEAD).

**Reference patterns:**
- API + tests: `src/app/api/admin/waitlist/route.ts` + `tests/admin/waitlist.test.ts`.
- Multi-call drizzle mock chains: `tests/api/book-waitlist.test.ts` (uses `mockReturnValueOnce` for sequential `db.select()` calls).
- Email helper: `sendBookingConfirmation` in `src/lib/email.ts` with `buildEmailHtml`.
- Sheet integration: `src/app/admin/schedule/waitlist-panel.tsx`.

---

## File Structure

**Create:**
- `drizzle/migrations/0006_*.sql` (drizzle-kit auto-generated).
- `tests/admin/bookings.test.ts` — covers both the existing cancel branch (regression) and the new reschedule branch.
- `src/app/admin/bookings/reschedule-sheet.tsx` — new client component, the Sheet UI.

**Modify:**
- `src/lib/db/schema.ts` — add two columns to `bookings`.
- `src/lib/email.ts` — add `sendRescheduleNotification`.
- `tests/lib/email.test.ts` — add one test case.
- `src/app/api/admin/bookings/route.ts` — extend PUT with the reschedule branch.
- `src/app/admin/bookings/page.tsx` — add Reschedule button, Sheet, moved chip, schedules fetch.
- `src/app/admin/schedule/page.tsx` — one-string confirm-dialog update.

---

## Task 1: Schema migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Generate: `drizzle/migrations/0006_*.sql`

- [ ] **Step 1: Add columns to the `bookings` table**

In `src/lib/db/schema.ts`, change the `bookings` definition:

```ts
export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id")
    .references(() => schedules.id)
    .notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  stripePaymentId: text("stripe_payment_id"),
  bundleId: integer("bundle_id").references(() => bundles.id),
  status: bookingStatus("status").notNull().default("confirmed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  emailSent: boolean("email_sent").default(false).notNull(),
  originalScheduleId: integer("original_schedule_id").references(
    () => schedules.id,
  ),
  rescheduledAt: timestamp("rescheduled_at"),
});
```

- [ ] **Step 2: Generate the migration**

Run with a dummy `DATABASE_URL` (drizzle-kit generate doesn't connect, but the config requires the variable):

```bash
DATABASE_URL=postgresql://dummy pnpm exec drizzle-kit generate
```

Expected: a new file `drizzle/migrations/0006_<adjective>_<noun>.sql` appears containing two `ALTER TABLE "bookings" ADD COLUMN ...` statements (plus the FK constraint for `original_schedule_id`). The `drizzle/migrations/meta/` snapshot files are also updated. Report the actual filename in your final report.

- [ ] **Step 3: Skip local apply**

Do NOT run `just db-migrate`. The local Postgres + Doppler env may not be running in the implementer's session; the migration file is what's committed. It applies automatically as part of the production `build` script (`drizzle-kit migrate && next build`).

- [ ] **Step 4: Typecheck**

```bash
just typecheck
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/
git commit -m "feat(reschedule): add originalScheduleId and rescheduledAt columns"
```

---

## Task 2: `sendRescheduleNotification` email helper (TDD)

**Files:**
- Modify: `src/lib/email.ts`
- Modify: `tests/lib/email.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/lib/email.test.ts`, extend the imports at the top so they include `sendRescheduleNotification`:

```ts
import {
  buildEmailHtml,
  sendBookingConfirmation,
  sendBookingNotification,
  sendBundleConfirmation,
  sendContactEmail,
  sendRescheduleNotification,
  sendWaitlistConfirmation,
  sendWaitlistNotification,
} from "@/lib/email";
```

Append a new describe block at the end of the file:

```ts
describe("sendRescheduleNotification", () => {
  it("sends HTML email to customer with old and new class details", async () => {
    const result = await sendRescheduleNotification({
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      classTitle: "Prenatal Yoga",
      oldDate: "2026-06-09",
      oldStartTime: "09:00",
      oldEndTime: "10:00",
      newDate: "2026-06-16",
      newStartTime: "09:00",
      newEndTime: "10:00",
      newLocation: "Studio 1, Hove",
    });

    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 2: Run the new test — verify it fails**

```bash
pnpm exec vitest run tests/lib/email.test.ts
```

Expected: the new describe block fails with `sendRescheduleNotification is not a function`. Other tests still pass.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/email.ts`:

```ts
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm exec vitest run tests/lib/email.test.ts
```

Expected: all tests pass (count goes from 8 to 9 in this file).

- [ ] **Step 5: Type-check + lint**

```bash
just typecheck && just lint
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email.ts tests/lib/email.test.ts
git commit -m "feat(reschedule): add sendRescheduleNotification email helper"
```

---

## Task 3: PUT `/api/admin/bookings` reschedule branch (TDD)

**Files:**
- Modify: `src/app/api/admin/bookings/route.ts`
- Create: `tests/admin/bookings.test.ts`

No test file exists for `/api/admin/bookings` today. We create one that covers both the existing cancel branch (as regression) and the new reschedule branch.

- [ ] **Step 1: Create the failing test file**

Create `tests/admin/bookings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockTransaction,
  mockTxUpdateSet,
  mockTxUpdateWhere,
  mockSendRescheduleNotification,
  mockAfter,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn();
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockTxUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockTxUpdateSet = vi
    .fn()
    .mockReturnValue({ where: mockTxUpdateWhere });
  const mockTransaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
    const tx = {
      update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
    };
    await cb(tx);
  });
  const mockSendRescheduleNotification = vi
    .fn()
    .mockResolvedValue({ success: true });
  const mockAfter = vi.fn((fn: () => Promise<void> | void) => fn());
  return {
    mockSelectFrom,
    mockSelectWhere,
    mockTransaction,
    mockTxUpdateSet,
    mockTxUpdateWhere,
    mockSendRescheduleNotification,
    mockAfter,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", scheduleId: "schedule_id", status: "status" },
  schedules: { id: "id", classId: "class_id", bookedCount: "booked_count" },
  classes: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col: unknown) => col),
  eq: vi.fn((...args: unknown[]) => args),
  sql: Object.assign(
    vi.fn((..._args: unknown[]) => "sql"),
    {},
  ),
}));

vi.mock("@/lib/email", () => ({
  sendRescheduleNotification: mockSendRescheduleNotification,
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>(
    "next/server",
  );
  return { ...actual, after: mockAfter };
});

import { PUT } from "@/app/api/admin/bookings/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/bookings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SAMPLE_BOOKING = {
  id: 1,
  scheduleId: 10,
  customerName: "Jane Doe",
  customerEmail: "jane@example.com",
  status: "confirmed",
  originalScheduleId: null,
};

const SAMPLE_SOURCE = {
  id: 10,
  classId: 100,
  date: "2026-06-09",
  startTime: "09:00",
  endTime: "10:00",
  capacity: 8,
  bookedCount: 3,
  location: "Studio 1",
  status: "open",
};

const SAMPLE_TARGET = {
  ...SAMPLE_SOURCE,
  id: 20,
  date: "2026-06-16",
  bookedCount: 2,
};

const SAMPLE_CLASS = { id: 100, title: "Prenatal Yoga" };

describe("PUT /api/admin/bookings — general validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  });

  it("returns 400 when id is missing", async () => {
    const response = await PUT(makeRequest({ status: "cancelled" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 400 when neither status nor newScheduleId is supplied", async () => {
    const response = await PUT(makeRequest({ id: 1 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing required fields");
  });
});

describe("PUT /api/admin/bookings — cancel branch (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  });

  it("returns 404 when booking not found", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    const response = await PUT(makeRequest({ id: 999, status: "cancelled" }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Booking not found");
  });

  it("returns 400 when booking is already cancelled", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { ...SAMPLE_BOOKING, status: "cancelled" },
    ]);
    const response = await PUT(makeRequest({ id: 1, status: "cancelled" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Booking is already cancelled");
  });

  it("returns 200 and updates the booking on success", async () => {
    mockSelectWhere.mockResolvedValueOnce([SAMPLE_BOOKING]);
    const response = await PUT(makeRequest({ id: 1, status: "cancelled" }));
    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    // First tx.update.set call = the booking update with cancelled status.
    expect(mockTxUpdateSet).toHaveBeenCalledWith({ status: "cancelled" });
  });
});

describe("PUT /api/admin/bookings — reschedule branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  });

  it("returns 404 when booking not found", async () => {
    mockSelectWhere.mockResolvedValueOnce([]);
    const response = await PUT(makeRequest({ id: 999, newScheduleId: 20 }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Booking not found");
  });

  it("returns 400 when booking is cancelled", async () => {
    mockSelectWhere.mockResolvedValueOnce([
      { ...SAMPLE_BOOKING, status: "cancelled" },
    ]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Cannot reschedule a cancelled booking");
  });

  it("returns 404 when target schedule not found", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 999 }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Target schedule not found");
  });

  it("returns 400 when target class differs from source class", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([{ ...SAMPLE_TARGET, classId: 999 }]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Cannot reschedule to a different class");
  });

  it("returns 400 when target schedule is cancelled", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([{ ...SAMPLE_TARGET, status: "cancelled" }]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Target class is cancelled");
  });

  it("returns 400 when target equals source", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([SAMPLE_SOURCE]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 10 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Booking is already on that schedule");
  });

  it("returns 400 when target is at capacity", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([
        { ...SAMPLE_TARGET, bookedCount: 8, capacity: 8 },
      ]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Target class is full");
  });

  it("returns 200 on first reschedule, sets originalScheduleId, sends email", async () => {
    mockSelectWhere
      .mockResolvedValueOnce([SAMPLE_BOOKING])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([SAMPLE_TARGET])
      .mockResolvedValueOnce([SAMPLE_CLASS]);
    const response = await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalled();
    // The booking update should include scheduleId, rescheduledAt, and originalScheduleId.
    const bookingUpdateCall = mockTxUpdateSet.mock.calls[0]?.[0];
    expect(bookingUpdateCall).toMatchObject({
      scheduleId: 20,
      originalScheduleId: 10,
    });
    expect(bookingUpdateCall.rescheduledAt).toBeInstanceOf(Date);
    expect(mockSendRescheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Jane Doe",
        customerEmail: "jane@example.com",
        classTitle: "Prenatal Yoga",
        oldDate: "2026-06-09",
        newDate: "2026-06-16",
      }),
    );
  });

  it("preserves originalScheduleId on second reschedule", async () => {
    const alreadyMoved = { ...SAMPLE_BOOKING, originalScheduleId: 5 };
    mockSelectWhere
      .mockResolvedValueOnce([alreadyMoved])
      .mockResolvedValueOnce([SAMPLE_SOURCE])
      .mockResolvedValueOnce([SAMPLE_TARGET])
      .mockResolvedValueOnce([SAMPLE_CLASS]);
    await PUT(makeRequest({ id: 1, newScheduleId: 20 }));
    const bookingUpdateCall = mockTxUpdateSet.mock.calls[0]?.[0];
    // Original stays as 5, not overwritten with 10.
    expect(bookingUpdateCall.originalScheduleId).toBe(5);
  });
});
```

- [ ] **Step 2: Run the test — verify failures**

```bash
pnpm exec vitest run tests/admin/bookings.test.ts
```

Expected: the cancel-branch tests pass against the existing implementation (they're regression coverage). The reschedule-branch tests fail because the route doesn't yet handle `newScheduleId`. The first failure is likely on the "Cannot reschedule a cancelled booking" or "Target schedule not found" path returning the wrong status/error.

- [ ] **Step 3: Update the route**

Replace `src/app/api/admin/bookings/route.ts` with:

```ts
import { desc, eq, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, classes, schedules } from "@/lib/db/schema";
import { sendRescheduleNotification } from "@/lib/email";

export async function GET() {
  const result = await db
    .select()
    .from(bookings)
    .innerJoin(schedules, eq(bookings.scheduleId, schedules.id))
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .orderBy(desc(bookings.createdAt));
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, status, newScheduleId } = body as {
    id?: number;
    status?: string;
    newScheduleId?: number;
  };

  if (!id || (!status && !newScheduleId)) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // Cancel branch (existing behaviour)
  if (status === "cancelled") {
    const existing = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));

    if (existing.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (existing[0].status === "cancelled") {
      return NextResponse.json(
        { error: "Booking is already cancelled" },
        { status: 400 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status: "cancelled" })
        .where(eq(bookings.id, id));
      await tx
        .update(schedules)
        .set({ bookedCount: sql`GREATEST(${schedules.bookedCount} - 1, 0)` })
        .where(eq(schedules.id, existing[0].scheduleId));
    });

    return NextResponse.json({ success: true });
  }

  // Reschedule branch
  if (newScheduleId) {
    const bookingRows = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, id));
    if (bookingRows.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    const booking = bookingRows[0];

    if (booking.status === "cancelled") {
      return NextResponse.json(
        { error: "Cannot reschedule a cancelled booking" },
        { status: 400 },
      );
    }

    const sourceRows = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, booking.scheduleId));
    const source = sourceRows[0];

    const targetRows = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, newScheduleId));
    if (targetRows.length === 0) {
      return NextResponse.json(
        { error: "Target schedule not found" },
        { status: 404 },
      );
    }
    const target = targetRows[0];

    if (target.classId !== source.classId) {
      return NextResponse.json(
        { error: "Cannot reschedule to a different class" },
        { status: 400 },
      );
    }

    if (target.status === "cancelled") {
      return NextResponse.json(
        { error: "Target class is cancelled" },
        { status: 400 },
      );
    }

    if (newScheduleId === booking.scheduleId) {
      return NextResponse.json(
        { error: "Booking is already on that schedule" },
        { status: 400 },
      );
    }

    if (target.bookedCount >= target.capacity) {
      return NextResponse.json(
        { error: "Target class is full" },
        { status: 400 },
      );
    }

    const classRows = await db
      .select()
      .from(classes)
      .where(eq(classes.id, source.classId));
    const classInfo = classRows[0];

    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({
          scheduleId: newScheduleId,
          rescheduledAt: new Date(),
          originalScheduleId: booking.originalScheduleId ?? booking.scheduleId,
        })
        .where(eq(bookings.id, id));
      await tx
        .update(schedules)
        .set({ bookedCount: sql`GREATEST(${schedules.bookedCount} - 1, 0)` })
        .where(eq(schedules.id, source.id));
      await tx
        .update(schedules)
        .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
        .where(eq(schedules.id, target.id));
    });

    after(async () => {
      try {
        await sendRescheduleNotification({
          customerName: booking.customerName,
          customerEmail: booking.customerEmail,
          classTitle: classInfo.title,
          oldDate: source.date,
          oldStartTime: source.startTime,
          oldEndTime: source.endTime,
          newDate: target.date,
          newStartTime: target.startTime,
          newEndTime: target.endTime,
          newLocation: target.location,
        });
      } catch (e) {
        console.error("Reschedule email send failed", e);
      }
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid status" }, { status: 400 });
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
pnpm exec vitest run tests/admin/bookings.test.ts
```

Expected: all 13 tests pass.

If a mock-chain shape doesn't match the implementation's actual call sequence (e.g. an extra `mockResolvedValueOnce` is needed because the implementation does one more select than expected), adjust the test mocks (NOT the implementation — the implementation is the source of truth).

- [ ] **Step 5: Type-check + lint + full suite**

```bash
just typecheck && just lint && just test
```

Expected: exit 0 across all three. Total test count goes from 96 to 109 in this file (12 new + 1 existing = wait, this is a new file, so 109 = 96 + 13 minus the 4 existing email tests adjusted). Actually: existing was 96, this PR adds 1 email test and 13 bookings tests, so total = **110**. The lint may auto-format the route file; that's fine.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/bookings/route.ts tests/admin/bookings.test.ts
git commit -m "feat(reschedule): add reschedule branch to PUT /api/admin/bookings"
```

---

## Task 4: Reschedule Sheet component + Bookings page integration

**Files:**
- Create: `src/app/admin/bookings/reschedule-sheet.tsx`
- Modify: `src/app/admin/bookings/page.tsx`

The reschedule UI is non-trivial enough to live in its own component, mirroring `src/app/admin/schedule/waitlist-panel.tsx`.

- [ ] **Step 1: Create the Sheet component**

Create `src/app/admin/bookings/reschedule-sheet.tsx`:

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface ScheduleRow {
  id: number;
  classId: number;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  location: string | null;
  status: string;
}

interface RescheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: number;
  customerName: string;
  classTitle: string;
  sourceScheduleId: number;
  sourceClassId: number;
  sourceDate: string;
  sourceStartTime: string;
  sourceEndTime: string;
  allSchedules: ScheduleRow[];
  onMoved: () => void;
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RescheduleSheet({
  open,
  onOpenChange,
  bookingId,
  customerName,
  classTitle,
  sourceScheduleId,
  sourceClassId,
  sourceDate,
  sourceStartTime,
  sourceEndTime,
  allSchedules,
  onMoved,
}: RescheduleSheetProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = todayString();
  const eligibleSchedules = useMemo(
    () =>
      allSchedules
        .filter(
          (s) =>
            s.classId === sourceClassId &&
            s.status !== "cancelled" &&
            s.date >= today &&
            s.id !== sourceScheduleId &&
            s.bookedCount < s.capacity,
        )
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [allSchedules, sourceClassId, sourceScheduleId, today],
  );

  async function handleMove(newScheduleId: number) {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/bookings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookingId, newScheduleId }),
    });
    if (res.ok) {
      onMoved();
      onOpenChange(false);
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Failed to reschedule. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Reschedule — {customerName} → {classTitle}
          </SheetTitle>
          <p className="text-sm text-deep-ocean/70">
            Currently on {formatDate(sourceDate)}, {sourceStartTime}–
            {sourceEndTime}
          </p>
        </SheetHeader>

        <div className="px-4 pb-6">
          {error && (
            <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <p className="mb-3 text-sm font-medium text-deep-tide-blue">
            Move to:
          </p>

          {eligibleSchedules.length === 0 ? (
            <p className="text-center text-soft-moonstone py-8">
              No other dates available for this class. Add a new schedule
              first, then come back.
            </p>
          ) : (
            <ul className="divide-y divide-soft-moonstone/20">
              {eligibleSchedules.map((s) => {
                const spotsLeft = s.capacity - s.bookedCount;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleMove(s.id)}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-ocean-light-blue/10 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-deep-tide-blue">
                          {formatDate(s.date)}
                        </p>
                        <p className="text-xs text-deep-ocean/60">
                          {s.startTime}–{s.endTime}
                          {s.location ? ` · ${s.location}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-deep-ocean">
                        {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Modify the Bookings page**

Replace `src/app/admin/bookings/page.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { useTableControls } from "@/components/admin/use-table-controls";
import { RescheduleSheet } from "./reschedule-sheet";

interface BookingRow {
  bookings: {
    id: number;
    scheduleId: number;
    customerName: string;
    customerEmail: string;
    stripePaymentId: string | null;
    bundleId: number | null;
    status: string;
    createdAt: string;
    emailSent: boolean;
    originalScheduleId: number | null;
    rescheduledAt: string | null;
  };
  schedules: {
    id: number;
    classId: number;
    date: string;
    startTime: string;
    endTime: string;
    capacity: number;
    bookedCount: number;
    location: string | null;
    status: string;
  };
  classes: {
    id: number;
    slug: string;
    title: string;
    category: string;
    bookingType: string;
    active: boolean;
    priceInPence: number;
  };
}

interface ClassType {
  id: number;
  title: string;
}

interface ScheduleApiRow {
  schedules: {
    id: number;
    classId: number;
    date: string;
    startTime: string;
    endTime: string;
    capacity: number;
    bookedCount: number;
    location: string | null;
    status: string;
  };
}

type StatusFilter = "all" | "confirmed" | "cancelled" | "waitlisted";
type TimeFilter = "upcoming" | "past" | "all";

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PillGroup<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-deep-ocean/60">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-deep-tide-blue text-dawn-light"
              : "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-deep-ocean hover:text-deep-tide-blue"
    >
      {label}
      {active && (
        <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );
}

export default function BookingsPage() {
  const [allBookings, setAllBookings] = useState<BookingRow[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [allSchedules, setAllSchedules] = useState<ScheduleApiRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");

  const [reschedulingBooking, setReschedulingBooking] =
    useState<BookingRow | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const fetchBookings = useCallback(async () => {
    const res = await fetch("/api/admin/bookings");
    const data = await res.json();
    setAllBookings(data);
    setLoading(false);
  }, []);

  const fetchSchedules = useCallback(async () => {
    const res = await fetch("/api/admin/schedules");
    if (res.ok) {
      const data = await res.json();
      setAllSchedules(data);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    fetchSchedules();
    fetch("/api/admin/classes")
      .then((r) => r.json())
      .then((d) => setClassTypes(d));
  }, [fetchBookings, fetchSchedules]);

  const filters = useMemo(() => {
    const today = todayString();
    const map: Record<string, (row: BookingRow) => boolean> = {};
    if (statusFilter !== "all") {
      map.status = (row) => row.bookings.status === statusFilter;
    }
    if (classFilter !== "all") {
      const id = Number(classFilter);
      map.class = (row) => row.classes.id === id;
    }
    if (timeFilter === "upcoming") {
      map.time = (row) => row.schedules.date >= today;
    } else if (timeFilter === "past") {
      map.time = (row) => row.schedules.date < today;
    }
    return map;
  }, [statusFilter, classFilter, timeFilter]);

  const { rows, search, setSearch, sort, toggleSort, total } =
    useTableControls<BookingRow>({
      rows: allBookings,
      sortKeys: {
        customer: (r) => r.bookings.customerName,
        class: (r) => r.classes.title,
        date: (r) => r.schedules.date,
        status: (r) => r.bookings.status,
      },
      searchFields: (r) => [r.bookings.customerName, r.bookings.customerEmail],
      filters,
      defaultSort: { key: "date", direction: "asc" },
    });

  function statusBadge(status: string) {
    const colours: Record<string, string> = {
      confirmed: "bg-seagrass/20 text-seagrass",
      cancelled: "bg-red-100 text-red-700",
      waitlisted: "bg-ocean-light-blue/20 text-ocean-light-blue",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colours[status] || "bg-gray-100 text-gray-600"}`}
      >
        {status}
      </span>
    );
  }

  function paymentType(row: BookingRow) {
    return row.bookings.bundleId ? "Bundle" : "Stripe";
  }

  async function handleCancel(bookingId: number) {
    if (
      !window.confirm(
        "Cancel this booking? The class slot will be freed. You'll need to refund in Stripe separately.",
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/bookings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookingId, status: "cancelled" }),
    });
    if (res.ok) {
      await fetchBookings();
    }
  }

  async function handleResendEmail(bookingId: number) {
    const res = await fetch("/api/admin/resend-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "booking", id: bookingId }),
    });
    if (res.ok) {
      await fetchBookings();
    }
  }

  function openReschedule(row: BookingRow) {
    setReschedulingBooking(row);
    setRescheduleOpen(true);
  }

  async function handleRescheduleMoved() {
    await fetchBookings();
    await fetchSchedules();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Bookings
      </h1>

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or email..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "confirmed", label: "Confirmed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "waitlisted", label: "Waitlisted" },
          ]}
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-deep-ocean/60">Class:</span>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-7 rounded-full bg-soft-moonstone/30 px-2.5 text-xs text-deep-ocean focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="all">All</option>
            {classTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <PillGroup
          label="Time"
          value={timeFilter}
          onChange={setTimeFilter}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
            { value: "all", label: "All" },
          ]}
        />
      </AdminTableToolbar>

      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-soft-moonstone/20 bg-dawn-light">
            <tr>
              <th className="px-4 py-3">
                <SortHeader
                  label="Customer"
                  sortKey="customer"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("customer")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Class"
                  sortKey="class"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("class")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Date"
                  sortKey="date"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("date")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Time
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Payment
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Status"
                  sortKey="status"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("status")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  No bookings match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr
                  key={item.bookings.id}
                  className="hover:bg-ocean-light-blue/10"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-deep-tide-blue">
                      {item.bookings.customerName}
                    </div>
                    <div className="text-xs text-deep-ocean/60">
                      {item.bookings.customerEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {item.classes.title}
                  </td>
                  <td className="px-4 py-3">
                    <span>{formatDate(item.schedules.date)}</span>
                    {item.bookings.rescheduledAt && (
                      <span
                        title={`Moved on ${formatDateTime(item.bookings.rescheduledAt)}`}
                        className="ml-2 inline-block rounded-full bg-soft-moonstone/30 px-2 py-0.5 text-xs text-deep-ocean"
                      >
                        moved
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.schedules.startTime} - {item.schedules.endTime}
                  </td>
                  <td className="px-4 py-3">{paymentType(item)}</td>
                  <td className="px-4 py-3">
                    {statusBadge(item.bookings.status)}
                    {!item.bookings.emailSent && (
                      <button
                        type="button"
                        onClick={() => handleResendEmail(item.bookings.id)}
                        className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-bright-orange/20 text-bright-orange hover:bg-bright-orange/30 transition-colors cursor-pointer"
                      >
                        resend email
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.bookings.status === "confirmed" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openReschedule(item)}
                          className="text-ocean-light-blue hover:text-deep-tide-blue text-sm mr-3"
                        >
                          Reschedule
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancel(item.bookings.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {reschedulingBooking && (
        <RescheduleSheet
          open={rescheduleOpen}
          onOpenChange={(o) => {
            setRescheduleOpen(o);
            if (!o) setReschedulingBooking(null);
          }}
          bookingId={reschedulingBooking.bookings.id}
          customerName={reschedulingBooking.bookings.customerName}
          classTitle={reschedulingBooking.classes.title}
          sourceScheduleId={reschedulingBooking.schedules.id}
          sourceClassId={reschedulingBooking.classes.id}
          sourceDate={reschedulingBooking.schedules.date}
          sourceStartTime={reschedulingBooking.schedules.startTime}
          sourceEndTime={reschedulingBooking.schedules.endTime}
          allSchedules={allSchedules.map((s) => s.schedules)}
          onMoved={handleRescheduleMoved}
        />
      )}
    </div>
  );
}
```

Notable changes from the existing file:
- New imports: `RescheduleSheet`, plus a `ScheduleApiRow` interface (the joined `/api/admin/schedules` response shape).
- `BookingRow.bookings` interface gains `originalScheduleId` and `rescheduledAt`.
- New state: `allSchedules`, `reschedulingBooking`, `rescheduleOpen`.
- New `fetchSchedules` callback; called on mount alongside the existing fetches.
- `formatDateTime` helper added (for the chip tooltip).
- New `openReschedule(row)` and `handleRescheduleMoved()` handlers.
- "Reschedule" button added next to "Cancel" in the Actions column, both gated on `status === "confirmed"`.
- "moved" chip rendered next to the Date cell when `bookings.rescheduledAt` is non-null, with a `title` attribute showing the move timestamp.
- `<RescheduleSheet>` rendered at the bottom of the JSX, conditioned on `reschedulingBooking` being set.

- [ ] **Step 3: Type-check + lint + tests**

```bash
just typecheck && just lint && just test
```

Expected: exit 0. Tests still 110 — no new unit tests for the UI components (consistent with the rest of the admin code).

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/bookings/page.tsx src/app/admin/bookings/reschedule-sheet.tsx
git commit -m "feat(reschedule): admin Reschedule action + Sheet on bookings page"
```

---

## Task 5: Schedule cancel-dialog copy update

**Files:**
- Modify: `src/app/admin/schedule/page.tsx`

- [ ] **Step 1: Update the confirm string**

In `src/app/admin/schedule/page.tsx`, find the `handleCancelClass` function. It contains:

```ts
if (
  !window.confirm(
    "Cancel this class? It will be hidden from the public calendar. Existing bookings remain — refund and notify customers separately.",
  )
) {
  return;
}
```

Replace the string argument with:

```ts
"Cancel this class? It will be hidden from the public calendar. Existing bookings remain — reschedule them individually from the Bookings page, or refund and notify customers separately."
```

Make NO other changes to the file.

- [ ] **Step 2: Type-check + lint + tests**

```bash
just typecheck && just lint && just test
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/schedule/page.tsx
git commit -m "chore(reschedule): mention reschedule in cancel-class confirm dialog"
```

---

## Task 6: Final regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
just test
```

Expected: **110/110 pass** (96 pre-PR + 13 new bookings tests + 1 new email test).

- [ ] **Step 2: Typecheck + lint**

```bash
just typecheck && just lint
```

Both should exit 0.

- [ ] **Step 3: Inspect the commit series**

```bash
git log --oneline origin/master..HEAD
```

Expected (rough order):
- `docs(reschedule): design spec for admin booking reschedule` (already on branch)
- `feat(reschedule): add originalScheduleId and rescheduledAt columns`
- `feat(reschedule): add sendRescheduleNotification email helper`
- `feat(reschedule): add reschedule branch to PUT /api/admin/bookings`
- `feat(reschedule): admin Reschedule action + Sheet on bookings page`
- `chore(reschedule): mention reschedule in cancel-class confirm dialog`

No noise, no WIP, no merges from master.

- [ ] **Step 4: Diff summary**

```bash
git diff --stat origin/master..HEAD
```

Expected files touched:
- `docs/superpowers/specs/2026-06-05-admin-booking-reschedule-design.md` (already on branch)
- `docs/superpowers/plans/2026-06-05-admin-booking-reschedule.md` (this file)
- `drizzle/migrations/0006_*.sql` + `drizzle/migrations/meta/` snapshot
- `src/lib/db/schema.ts`
- `src/lib/email.ts`
- `src/app/api/admin/bookings/route.ts`
- `src/app/admin/bookings/page.tsx`
- `src/app/admin/bookings/reschedule-sheet.tsx` (new)
- `src/app/admin/schedule/page.tsx`
- `tests/admin/bookings.test.ts` (new)
- `tests/lib/email.test.ts`

Flag any unexpected files (config edits, unrelated touches).

- [ ] **Step 5: Working-tree status**

```bash
git status --short
```

Expected: clean.

- [ ] **Step 6: Do NOT commit anything in this task.** This is verification only.

---

## Self-review notes

- **Spec coverage:** every section of the spec maps to tasks:
  - Data model → Task 1.
  - API reschedule branch → Task 3.
  - Email helper → Task 2.
  - Bookings page Reschedule action + Sheet + moved chip → Task 4.
  - Schedule cancel-dialog copy update → Task 5.
  - Tests called out in spec → woven into 2 and 3.
  - Out-of-scope items respected — none implemented.

- **No placeholders.** Every step has the exact code and exact commands.

- **Type consistency:** the `BookingRow.bookings` interface in Task 4 adds `originalScheduleId` and `rescheduledAt` matching the schema columns from Task 1. The `RescheduleSheet` prop types in Task 4 map cleanly to the `BookingRow` fields and the API request body shape established in Task 3.

- **Cosmetic duplication:** `PillGroup` and `SortHeader` already live duplicated across three admin pages (per the previous PR's plan). This PR doesn't touch that — the bookings page rewrite keeps the existing inline helpers.

- **Test count math:** existing baseline is 96. Task 2 adds 1 email test (97). Task 3 adds 13 bookings tests (110). No other tests are added or removed.

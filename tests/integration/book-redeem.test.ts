import { and, eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/book/redeem/route";
import { db } from "@/lib/db";
import { bookings, bundles, schedules } from "@/lib/db/schema";
import { createBundle, createSchedule } from "./support/factories";

// An ordinary redemption sends nothing, but the route imports the helper, so
// the module is replaced rather than reaching for a Resend key.
vi.mock("@/lib/email", () => ({ sendBookingConfirmation: vi.fn() }));

/**
 * Spending a bundle credit against a real database: request in, rows out. The
 * mocked equivalent in `tests/api/book-redeem.test.ts` asserts which statements
 * were issued; this asserts the balance and the bookings afterwards, which is
 * the whole of what a lost update gets wrong.
 */

const CUSTOMER = "jane@example.com";

function redeem(scheduleId: number) {
  return POST(
    new Request("http://localhost/api/book/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduleId,
        customerName: "Jane Doe",
        customerEmail: CUSTOMER,
      }),
    }),
  );
}

async function readBundle(id: number) {
  const [row] = await db.select().from(bundles).where(eq(bundles.id, id));
  return row;
}

/**
 * Wait until some session is stuck on a lock — the route having reached the
 * debit. A poll rather than a sleep, so the interleaving is a fact the test
 * establishes rather than a delay it hopes is long enough.
 */
async function waitForABlockedSession(client: postgres.Sql) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const [{ blocked }] = await client<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity
      WHERE wait_event_type = 'Lock'`;
    if (blocked > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("nothing ever blocked on the bundle row");
}

async function bookingsFor(customerEmail: string) {
  return await db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.customerEmail, customerEmail),
        eq(bookings.status, "confirmed"),
      ),
    );
}

describe("which bundle a credit comes out of", () => {
  it("spends the one that expires soonest", async () => {
    const schedule = await createSchedule({ capacity: 8 });
    // Inserted in the order that gets it wrong: an unordered read hands back
    // the row it found first, which is the bundle with months left on it.
    const later = await createBundle({
      customerEmail: CUSTOMER,
      expiresAt: new Date("2027-03-01T00:00:00Z"),
    });
    const sooner = await createBundle({
      customerEmail: CUSTOMER,
      expiresAt: new Date("2026-10-01T00:00:00Z"),
    });

    const response = await redeem(schedule.id);

    expect(response.status).toBe(200);
    expect((await readBundle(sooner.id)).creditsRemaining).toBe(5);
    expect((await readBundle(later.id)).creditsRemaining).toBe(6);
    expect((await bookingsFor(CUSTOMER))[0].bundleId).toBe(sooner.id);
  });
});

describe("two redemptions racing for one credit", () => {
  it("books one class and refuses the other", async () => {
    // Different classes, so the seats are separate and the one-booking-per-
    // schedule index is not what refuses the loser: the only thing in short
    // supply is the credit.
    const morning = await createSchedule({ capacity: 8 });
    const evening = await createSchedule({ capacity: 8 });
    const purchase = await createBundle({
      customerEmail: CUSTOMER,
      creditsTotal: 6,
      creditsRemaining: 1,
    });

    const responses = await Promise.all([
      redeem(morning.id),
      redeem(evening.id),
    ]);

    // One booked, one refused. Which refusal the loser gets depends on where
    // it had got to — the read finding an exhausted bundle, or the debit
    // finding the credit gone — and both are correct answers.
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status >= 400)).toHaveLength(1);
    expect(await bookingsFor(CUSTOMER)).toHaveLength(1);
    expect(await readBundle(purchase.id)).toMatchObject({
      creditsRemaining: 0,
      status: "exhausted",
    });

    // The class the refused redemption was for is left as it was: no seat
    // taken and nobody expecting to be there.
    const seats = await db
      .select()
      .from(schedules)
      .where(inArray(schedules.id, [morning.id, evening.id]));
    expect(seats.map((seat) => seat.bookedCount).sort()).toEqual([0, 1]);
  });

  it("refuses the redemption whose credit was spent while it was booking", async () => {
    // The interleaving the lost update needed, forced rather than hoped for:
    // this redemption reads a bundle with one credit on it, and the credit is
    // gone by the time it comes to spend it. Held under a row lock so the
    // ordering is the same on every run — the route blocks on the locked
    // bundle, the credit is taken from under it, and only then is it let go.
    const schedule = await createSchedule({ capacity: 8 });
    const purchase = await createBundle({
      customerEmail: CUSTOMER,
      creditsTotal: 6,
      creditsRemaining: 1,
    });

    // Two connections: one held by the transaction below, one for the poll that
    // watches for the route blocking on it.
    const other = postgres(process.env.DATABASE_URL as string, { max: 2 });
    let pending: Promise<Response> | undefined;
    try {
      await other.begin(async (tx) => {
        await tx`UPDATE bundles SET credits_remaining = 0, status = 'exhausted' WHERE id = ${purchase.id}`;
        // Uncommitted, so the route's read still sees the credit and only the
        // debit waits on the lock.
        pending = redeem(schedule.id);
        await waitForABlockedSession(other);
      });
    } finally {
      await other.end();
    }

    const response = await pending;
    expect(response?.status).toBe(409);
    expect((await response?.json()).error).toBe(
      "That bundle has no credits left",
    );

    // Nothing of the refused redemption survives: no booking, no seat taken,
    // and the credit spent exactly once.
    expect(await bookingsFor(CUSTOMER)).toHaveLength(0);
    const [seat] = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, schedule.id));
    expect(seat.bookedCount).toBe(0);
    expect((await readBundle(purchase.id)).creditsRemaining).toBe(0);
  });

  it("says the bundle has run out", async () => {
    const schedule = await createSchedule({ capacity: 8 });
    await createBundle({
      customerEmail: CUSTOMER,
      creditsTotal: 6,
      creditsRemaining: 1,
    });
    // The first redemption spends the last credit.
    await redeem((await createSchedule({ capacity: 8 })).id);

    const response = await redeem(schedule.id);

    // The bundle is exhausted by now, so the read refuses before the debit —
    // the same answer either way, which is the point.
    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("No active bundle found");
  });
});

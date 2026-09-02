import { and, eq, gt, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { bundles } from "@/lib/db/schema";

/**
 * Every change to `bundles.creditsRemaining` goes through this module. Routes
 * must not compute a new balance and write it back: the arithmetic that decides
 * whether a credit is there to spend has to be part of the statement that
 * spends it, or two redemptions read the same balance and both write it.
 */

/** The root db client or an open transaction — both can run these writes. */
export type CreditWriter = Pick<typeof db, "update">;

/** Outcome of a guarded debit. Refusal is a value, never an exception. */
export type CreditSpend =
  | { spent: true; creditsRemaining: number }
  | { spent: false };

/**
 * Spend one credit, only while there is one to spend.
 *
 * The guard lives in the UPDATE's WHERE clause and the new balance is computed
 * by Postgres from the row it locks, so the check and the debit are one
 * statement: two simultaneous redemptions of one remaining credit cannot both
 * succeed. Callers get `{ spent: false }` — no throw — when the bundle has
 * nothing left. A bundle spent down to nothing is `exhausted`; the admin
 * refund path brings it back.
 */
export async function spendCredit(
  writer: CreditWriter,
  bundleId: number,
): Promise<CreditSpend> {
  const [spent] = await writer
    .update(bundles)
    .set({
      creditsRemaining: sql`${bundles.creditsRemaining} - 1`,
      status: sql`CASE WHEN ${bundles.creditsRemaining} - 1 = 0 THEN 'exhausted'::bundle_status ELSE ${bundles.status} END`,
    })
    .where(and(eq(bundles.id, bundleId), gt(bundles.creditsRemaining, 0)))
    .returning({ creditsRemaining: bundles.creditsRemaining });

  return spent ? { spent: true, ...spent } : { spent: false };
}

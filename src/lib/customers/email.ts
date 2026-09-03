import { type AnyColumn, type SQL, sql } from "drizzle-orm";

/**
 * A customer's email address is their identity here — there is no customer
 * login, so bookings, bundles and waiting-list places are all keyed by what
 * they typed into a form. That makes comparing two addresses a decision, and
 * this is the one place it is made: handlers do not fold case or trim
 * whitespace of their own accord.
 */

/**
 * The address as it will be stored, matched and emailed: trimmed, and folded
 * to lower case.
 *
 * Case folding the local part is technically a choice — RFC 5321 lets a server
 * treat `Ada@` and `ada@` as different mailboxes — but no mail provider a
 * customer of this site uses does, and treating them as different people is
 * what let one person be charged twice for the same class.
 */
export function normaliseEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * "This column holds that customer's address", for a WHERE clause.
 *
 * Case-insensitive on both sides, so it finds the rows written before any of
 * this existed — a bundle bought as `Ada@` is the same customer's as one bought
 * as `ada@`, and refusing to spend it is the bug that made her pay twice. The
 * unique indexes are on `lower(customer_email)` for the same reason, so this
 * comparison is the one they can use.
 */
export function emailMatches(
  column: AnyColumn,
  value: string | null | undefined,
): SQL {
  return sql`lower(${column}) = ${normaliseEmail(value)}`;
}

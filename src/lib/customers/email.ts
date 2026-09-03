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

import { after } from "next/server";
import { sendEmail } from "./adapter";
import type { DeliveryTable, DeliveryTarget } from "./delivery";
import { markEmailFailed, markEmailSent } from "./delivery";
import type { NotificationEvent } from "./events";
import { AUDIENCE_ORDER, addressFor, recipientsFor } from "./policy";

/**
 * The one way anything at Moontide tells somebody something.
 *
 * A caller says what happened — `notify({ type: "booking-confirmed", ... })` —
 * and where the delivery state for it lives. It does not choose a template,
 * resolve a recipient, schedule the work, catch anything, or touch the
 * `emailSent` columns. Nine call sites each hand-rolled their own `after` plus
 * `try/catch` plus flag write, and they had drifted into four different error
 * postures: one swallowed the failure, one had no `try/catch` at all and 500'd
 * the admin UI, one counted failures, one let a failure propagate out of the
 * daily cron. One wrapper is what makes that a single decision.
 */

export type { BookingPayment, NotificationEvent } from "./events";
export type { Audience } from "./policy";

/**
 * Where the record of this send lives.
 *
 * A row that owes somebody an email carries the delivery state, and this names
 * it. `notRecorded` is the other case, and it takes the reason as a sentence
 * because "why does this one not get retried?" is a real question about every
 * notification here — see the fire-and-forget list in AGENTS.md.
 */
export type DeliveryRecord =
  | { on: DeliveryTable; row: DeliveryTarget }
  | { notRecorded: string };

/** Whether the copy that matters got through. Never thrown, always returned. */
export type NotifyResult = { ok: true } | { ok: false; error: unknown };

/**
 * Tell everybody this event concerns, and record what happened.
 *
 * Never throws: every caller of the old senders was already wrapping them, and
 * the two that were not turned a Resend outage into a 500 on the admin page and
 * a lost cron run. A caller that needs to say something about a failure reads
 * the result.
 */
export async function notify(
  event: NotificationEvent,
  record: DeliveryRecord,
): Promise<NotifyResult> {
  const recipients = recipientsFor(event);
  // The customer's copy decides the outcome; when an event has no customer copy
  // — the digest, the contact form, the missing-product alert — the admin's is
  // the only send there is, so it decides instead.
  const decidedBy: keyof typeof recipients = recipients.customer
    ? "customer"
    : "admin";

  let result: NotifyResult = { ok: true };

  for (const audience of AUDIENCE_ORDER) {
    const template = recipients[audience];
    if (!template) continue;

    try {
      await sendEmail({ to: addressFor(audience, event), ...template(event) });
    } catch (error) {
      console.error(
        `Failed to send the ${audience} copy of ${event.type}:`,
        error,
      );
      if (audience === decidedBy) result = { ok: false, error };
    }
  }

  if ("on" in record) {
    if (result.ok) {
      await markEmailSent(record.on, record.row);
    } else {
      // The row keeps its unsent flag, so the overnight sweep picks it up
      // again, and now carries why this attempt did not get through.
      await markEmailFailed(record.on, record.row, result.error);
    }
  }

  return result;
}

/**
 * The same thing, after the response has gone back.
 *
 * A customer waiting on a booking should not also be waiting on Resend, so
 * every request handler that sends something uses this. `after` is here and
 * nowhere else, which is what stops one route forgetting it.
 */
export function notifyAfterResponse(
  event: NotificationEvent,
  record: DeliveryRecord,
): void {
  after(async () => {
    await notify(event, record);
  });
}

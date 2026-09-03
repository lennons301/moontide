"use client";

import { formatDateTime } from "./format-date";

/**
 * The delivery state a row carries, as the admin API answers with it.
 *
 * Both tables that show it read the same four columns, so both say the same
 * thing about a confirmation that has not arrived.
 */
export interface EmailDelivery {
  emailSent: boolean;
  emailAttempts: number;
  emailSentAt: string | null;
  emailLastError: string | null;
}

/**
 * Resend a confirmation, whatever the flag says.
 *
 * The button used to be rendered only when `emailSent` was false, which made a
 * row whose flag was stuck true impossible to resend from the admin at all —
 * exactly the row a customer rings up about. Gabrielle resends because someone
 * told her nothing arrived, and "we recorded that it went" is the claim she is
 * checking, so it can never be the reason the button is missing.
 *
 * The flag still decides how loudly it reads: unsent is orange and asks to be
 * pressed, sent is quiet and sits beside the status. Either way the hover text
 * says what the delivery state actually is, last error included.
 */
/** What the hover text says: the whole delivery state, in one line. */
export function describeDelivery({
  emailSent,
  emailAttempts,
  emailSentAt,
  emailLastError,
}: EmailDelivery): string {
  const parts: string[] = [
    emailSent
      ? emailSentAt
        ? `Sent ${formatDateTime(emailSentAt)}`
        : "Recorded as sent"
      : "Not sent yet",
  ];
  if (emailAttempts > 0) {
    parts.push(`${emailAttempts} attempt${emailAttempts === 1 ? "" : "s"}`);
  }
  if (emailLastError) parts.push(`Last error: ${emailLastError}`);
  return parts.join(" · ");
}

export function ResendEmailButton({
  delivery,
  onResend,
}: {
  delivery: EmailDelivery;
  onResend: () => void;
}) {
  const { emailSent } = delivery;

  const style = emailSent
    ? "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
    : "bg-bright-orange/20 text-bright-orange hover:bg-bright-orange/30";

  return (
    <button
      type="button"
      onClick={onResend}
      title={describeDelivery(delivery)}
      className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium transition-colors cursor-pointer ${style}`}
    >
      {emailSent ? "resend email" : "email not sent — resend"}
    </button>
  );
}

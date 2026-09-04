import type { CreateEmailOptions } from "resend";
import { Resend } from "resend";

/**
 * Where an email actually goes.
 *
 * Every notification this module sends leaves through an `EmailAdapter`, and
 * nothing outside this file names Resend or constructs one. Two adapters
 * implement it: the Resend one below, and the in-memory one in
 * `./in-memory-adapter` that a test reads sent messages back out of — so the
 * seam is a thing the tests actually stand on rather than a shape nothing uses.
 */
export interface EmailAdapter {
  send(message: EmailMessage): Promise<void>;
}

/**
 * The one `from` address in the codebase. It was written out eleven times, once
 * per sender, which is eleven places to change it and eleven chances to differ.
 */
export const FROM_ADDRESS = "Moontide <noreply@gabriellemoontide.co.uk>";

/** An email is either the branded HTML or plain text — never neither. */
type EmailBody =
  | { html: string; text?: never }
  | { text: string; html?: never };

export type EmailMessage = {
  to: string;
  subject: string;
  /** Set only where a reply should reach someone other than Gabrielle. */
  replyTo?: string;
} & EmailBody;

/**
 * Built on first send rather than on import: the constructor wants an API key,
 * and a module that demands one the moment it is imported makes every test that
 * touches a route reach for a mock of the transport.
 */
let client: Resend | null = null;

function resendClient(): Resend {
  if (client === null) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

/** The live adapter. */
export const resendAdapter: EmailAdapter = {
  async send(message) {
    await resendClient().emails.send({
      from: FROM_ADDRESS,
      ...message,
    } as CreateEmailOptions);
  },
};

let activeAdapter: EmailAdapter = resendAdapter;

/**
 * Swap the transport. Tests only — production never calls this, so every send
 * that matters goes through Resend.
 */
export function setEmailAdapter(adapter: EmailAdapter): void {
  activeAdapter = adapter;
}

/** Back to Resend. Tests call this when they are done. */
export function resetEmailAdapter(): void {
  activeAdapter = resendAdapter;
}

/** One message, through whichever adapter is installed. Throws as it throws. */
export function sendEmail(message: EmailMessage): Promise<void> {
  return activeAdapter.send(message);
}

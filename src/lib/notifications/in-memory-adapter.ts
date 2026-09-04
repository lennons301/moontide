import type { EmailAdapter, EmailMessage } from "./adapter";
import { FROM_ADDRESS } from "./adapter";

/** A message as it was handed to the transport, `from` included. */
export type RecordedEmail = EmailMessage & { from: string };

export interface InMemoryEmails {
  adapter: EmailAdapter;
  /** Everything sent since this was created, oldest first. */
  sent: RecordedEmail[];
  /** The messages that went to one address. */
  to(address: string): RecordedEmail[];
  /**
   * Make matching sends throw, as Resend does when it refuses one. This is the
   * only way to test what a half-delivered notification leaves behind.
   */
  failWhen(matches: (message: RecordedEmail) => boolean): void;
}

/**
 * The other adapter: a mailbox held in a variable.
 *
 * Tests assert on what arrived — the recipient, the subject, the words in the
 * body — rather than on which internal function was called with which options
 * bag, which is what eight of the old sender tests settled for.
 */
export function inMemoryEmails(): InMemoryEmails {
  const sent: RecordedEmail[] = [];
  let failing: ((message: RecordedEmail) => boolean) | null = null;

  return {
    sent,
    to: (address) => sent.filter((message) => message.to === address),
    failWhen(matches) {
      failing = matches;
    },
    adapter: {
      async send(message) {
        const recorded = { from: FROM_ADDRESS, ...message } as RecordedEmail;
        if (failing?.(recorded)) {
          throw new Error(`Refused to send to ${recorded.to}`);
        }
        sent.push(recorded);
      },
    },
  };
}

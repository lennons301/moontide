import {
  resetEmailAdapter,
  setEmailAdapter,
} from "@/lib/notifications/adapter";
import type { InMemoryEmails } from "@/lib/notifications/in-memory-adapter";
import { inMemoryEmails } from "@/lib/notifications/in-memory-adapter";

/**
 * A mailbox in place of Resend, for the run of one test.
 *
 * The transport is a seam with two implementations, and this is the second one:
 * a test reads back what actually arrived — who it went to, what it said —
 * rather than asserting that some internal sender was called with an options
 * bag. Pair it with `afterEach(resetEmailAdapter)`.
 */
export function givenEmailsCollected(): InMemoryEmails {
  const mailbox = inMemoryEmails();
  setEmailAdapter(mailbox.adapter);
  return mailbox;
}

export { resetEmailAdapter };

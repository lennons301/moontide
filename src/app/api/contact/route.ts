import { NextResponse } from "next/server";
import { z } from "zod";
import { normaliseEmail } from "@/lib/customers/email";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";
import { notify } from "@/lib/notifications";

/**
 * The one endpoint anyone on the internet can write rows with, and until now
 * the only thing it asked of them was that the four fields were truthy: an
 * address with no `@`, a name of spaces and a message of any length at all were
 * all stored and forwarded. Gabrielle replies to what is stored, so it has to
 * be an address.
 *
 * Every message is written into the schema, because the response says exactly
 * what the schema said — the same convention the admin routes are held to.
 */

const required = { error: "All fields are required" };

const text = (max: number, tooLong: string) =>
  z.string(required).trim().min(1, required).max(max, { error: tooLong });

const submission = z.object(
  {
    name: text(100, "Your name is too long"),
    // Trimmed and folded through the one place that decides what an address
    // is, so a reply goes to the same customer a booking would.
    email: z
      .string(required)
      .trim()
      .min(1, required)
      .max(254, { error: "That email address is too long" })
      .pipe(z.email({ error: "A valid email address is required" }))
      .transform(normaliseEmail),
    subject: text(200, "That subject is too long"),
    message: text(5000, "Your message is too long"),
  },
  required,
);

/** One sentence for the form to show, with repeated messages collapsed. */
function refusal(error: z.ZodError): string {
  return [...new Set(error.issues.map((issue) => issue.message))].join(", ");
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = submission.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: refusal(parsed.error) }, { status: 400 });
  }

  const { name, email, subject, message } = parsed.data;

  await db.insert(contactSubmissions).values({ name, email, subject, message });

  await notify(
    { type: "contact-message", name, email, subject, message },
    {
      // Deliberately fire-and-forget, with no delivery state and no retry: the
      // submission is already a row, and every one of them is listed at
      // /admin/messages with its unread flag. The email is a nudge towards a
      // message Gabrielle can read either way, so there is nothing here that a
      // failed send loses.
      notRecorded: "the submission is a row in /admin/messages either way",
    },
  );

  return NextResponse.json({ success: true });
}

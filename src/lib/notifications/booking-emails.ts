import type { BookingPayment } from "@/lib/email";
import {
  sendBookingConfirmation,
  sendBookingNotification,
  sendRescheduleNotification,
} from "@/lib/email";

/**
 * What a booking's pending notification actually is, and how it is sent.
 *
 * Both paths that send a booking email — the overnight sweep and the admin's
 * resend button — go through here. They are the two paths the ticket found had
 * drifted apart on the bundle join, and the resend button then acquired a
 * quieter version of the same fault: it sent a plain confirmation to a booking
 * that was owed a moved-date note, and marked the row settled, so the note was
 * never sent by anything. One definition of which email a row owes is what
 * stops that happening a third time.
 */

/** The notifications a booking can owe its customer. */
export type BookingNotificationKind = "confirmation" | "reschedule";

/**
 * The kind stored on the row, if it is one this knows how to send.
 *
 * `bookings.emailKind` is text, so a value from a future writer (or a hand-run
 * UPDATE) is possible. Both callers report a null rather than guessing: the
 * sweep counts and logs it, the resend route refuses in as many words.
 */
export function recognisedKind(kind: string): BookingNotificationKind | null {
  return kind === "confirmation" || kind === "reschedule" ? kind : null;
}

/**
 * A booking as both callers' joins return it: the booking, the class it is on,
 * the bundle that funded it if any, and the class it was moved off if any.
 */
export type BookingEmailRow = {
  bookings: { customerName: string; customerEmail: string };
  schedules: {
    date: string;
    startTime: string;
    endTime: string;
    location: string | null;
  };
  classes: { title: string; priceInPence: number };
  /** Left-joined: null when the customer paid by card. */
  bundles: { creditsRemaining: number } | null;
  /** Left-joined on `originalScheduleId`: null when there was no move, or the class it was moved off has been deleted. */
  original_schedules: {
    date: string;
    startTime: string;
    endTime: string;
  } | null;
};

/**
 * A booking with a bundle behind it was paid for with a credit, so the email
 * says so and states the balance. Only a booking with no bundle gets a price —
 * quoting a class price to someone who spent a credit is money they never paid.
 */
export function bookingPayment(
  row: Pick<BookingEmailRow, "bundles" | "classes">,
): BookingPayment {
  return row.bundles
    ? { method: "credit", creditsRemaining: row.bundles.creditsRemaining }
    : { method: "card", priceInPence: row.classes.priceInPence };
}

/**
 * Send the notification this booking owes, customer copy and Gabrielle's.
 *
 * A reschedule note names the class the booking started on
 * (`originalScheduleId`), which after a chain of moves is where the customer
 * first booked rather than the hop before this one — true either way, and the
 * alternative is a second foreign key to `schedules` recording only the last
 * hop. When that class has been deleted there is no "from" to name, so the
 * customer gets a plain confirmation of the class they are on: accurate,
 * useful, and it means a retry stops failing nightly for ever on a class that
 * no longer exists.
 */
export async function sendBookingEmail(
  row: BookingEmailRow,
  kind: BookingNotificationKind,
): Promise<void> {
  if (kind === "reschedule" && row.original_schedules) {
    await sendRescheduleNotification({
      customerName: row.bookings.customerName,
      customerEmail: row.bookings.customerEmail,
      classTitle: row.classes.title,
      oldDate: row.original_schedules.date,
      oldStartTime: row.original_schedules.startTime,
      oldEndTime: row.original_schedules.endTime,
      newDate: row.schedules.date,
      newStartTime: row.schedules.startTime,
      newEndTime: row.schedules.endTime,
      newLocation: row.schedules.location,
    });
    return;
  }

  const details = {
    customerName: row.bookings.customerName,
    customerEmail: row.bookings.customerEmail,
    classTitle: row.classes.title,
    date: row.schedules.date,
    startTime: row.schedules.startTime,
    endTime: row.schedules.endTime,
    location: row.schedules.location,
    payment: bookingPayment(row),
  };

  await sendBookingConfirmation(details);
  await sendBookingNotification({ type: "individual", ...details });
}

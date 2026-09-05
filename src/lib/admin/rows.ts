import type { InferSelectModel } from "drizzle-orm";
import type {
  bookings,
  bundleConfig,
  bundles,
  classes,
  contactSubmissions,
  schedules,
} from "@/lib/db/schema";

/**
 * The shapes `/api/admin/*` answers with, derived from the Drizzle schema
 * rather than hand-written beside each `fetch`. The schedules row alone had
 * been copied out three times — twice into the same file — and nothing made
 * them follow a column being added or a status gaining a value.
 *
 * Types only: this file compiles to nothing, so a client page importing it
 * pulls no schema into the bundle.
 */

/**
 * What a row looks like after `NextResponse.json`: a `timestamp` column is a
 * `Date` on the server and an ISO string by the time a page reads it. Wrapped
 * in tuples so the conditional does not distribute — `number | null` must stay
 * `number | null` rather than picking up the nullable-Date branch.
 */
type Serialized<T> = {
  [K in keyof T]: [T[K]] extends [Date]
    ? string
    : [T[K]] extends [Date | null]
      ? string | null
      : T[K];
};

export type ClassRow = Serialized<InferSelectModel<typeof classes>>;
export type ScheduleRow = Serialized<InferSelectModel<typeof schedules>>;
export type BookingRow = Serialized<InferSelectModel<typeof bookings>>;
export type BundleRow = Serialized<InferSelectModel<typeof bundles>>;
export type MessageRow = Serialized<
  InferSelectModel<typeof contactSubmissions>
>;
export type BundleConfigApiRow = Serialized<
  InferSelectModel<typeof bundleConfig>
>;

/** `GET /api/admin/schedules`: the join, plus the two counts it computes. */
export interface AdminScheduleRow {
  schedules: ScheduleRow;
  classes: ClassRow;
  waitlistCount: number;
  /** Seats inside `bookedCount` that are being held for a waiting-list offer. */
  heldCount: number;
}

/** `GET /api/admin/bookings`: a booking with the class it is on. */
export interface AdminBookingRow {
  bookings: BookingRow;
  schedules: ScheduleRow;
  classes: ClassRow;
}

/** `GET /api/admin/pricing`: the bundle products. Class pricing moved to
 * `GET /api/admin/classes` — see `ClassRow`. */
export interface AdminPricingResponse {
  bundleConfigs: BundleConfigApiRow[];
}

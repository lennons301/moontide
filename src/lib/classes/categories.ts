/**
 * The one list behind `classes.category` and `classes.bookingType`, imported
 * by both the Postgres enum (`src/lib/db/schema.ts`) and the admin classes
 * API's validation — and safe for a "use client" page to import, unlike the
 * schema itself, which pulls Drizzle into the browser bundle.
 */
export const CLASS_CATEGORIES = ["class", "coaching", "community"] as const;
export type ClassCategory = (typeof CLASS_CATEGORIES)[number];

export const BOOKING_TYPES = ["stripe", "contact"] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

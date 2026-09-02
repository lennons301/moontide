import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Enums
export const classCategory = pgEnum("class_category", [
  "class",
  "coaching",
  "community",
]);

export const bookingType = pgEnum("booking_type", ["stripe", "contact"]);

export const scheduleStatus = pgEnum("schedule_status", [
  "open",
  "full",
  "cancelled",
]);

export const bookingStatus = pgEnum("booking_status", [
  "confirmed",
  "cancelled",
  "waitlisted",
  // Seat handed back, but the customer is still owed a class they paid card for.
  "released",
  // Seat held for one named person on the waiting list until their offer
  // deadline. It occupies capacity like any other booking, but nobody has paid
  // for it yet and nobody is coming unless the offer is taken up.
  "held",
]);

export const bundleStatus = pgEnum("bundle_status", [
  "active",
  "expired",
  "exhausted",
]);

// Existing table
export const contactSubmissions = pgTable("contact_submissions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  read: boolean("read").default(false).notNull(),
});

// New tables
export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  sanityId: text("sanity_id"),
  category: classCategory("category").notNull(),
  bookingType: bookingType("booking_type").notNull().default("stripe"),
  active: boolean("active").default(true).notNull(),
  priceInPence: integer("price_in_pence").notNull(),
  title: text("title").notNull(),
  // Whether class bundle credits may be redeemed against this class.
  bundleEligible: boolean("bundle_eligible").default(true).notNull(),
});

export const schedules = pgTable("schedules", {
  id: serial("id").primaryKey(),
  classId: integer("class_id")
    .references(() => classes.id)
    .notNull(),
  date: date("date").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  capacity: integer("capacity").notNull().default(8),
  bookedCount: integer("booked_count").notNull().default(0),
  location: text("location"),
  recurringRule: text("recurring_rule"),
  status: scheduleStatus("status").notNull().default("open"),
});

export const bundles = pgTable("bundles", {
  id: serial("id").primaryKey(),
  customerEmail: text("customer_email").notNull(),
  creditsTotal: integer("credits_total").notNull().default(6),
  creditsRemaining: integer("credits_remaining").notNull().default(6),
  stripePaymentId: text("stripe_payment_id").notNull().unique(),
  // Which bundle product was bought. Nullable: bundles purchased before this
  // column existed can only have it inferred from their credit count, and that
  // is ambiguous once two configs sell the same number of credits.
  bundleConfigId: integer("bundle_config_id").references(() => bundleConfig.id),
  purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  status: bundleStatus("status").notNull().default("active"),
  emailSent: boolean("email_sent").default(false).notNull(),
});

export const bundleConfig = pgTable("bundle_config", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  priceInPence: integer("price_in_pence").notNull(),
  credits: integer("credits").notNull(),
  expiryDays: integer("expiry_days").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id")
      .references(() => schedules.id)
      .notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    stripePaymentId: text("stripe_payment_id"),
    bundleId: integer("bundle_id").references(() => bundles.id),
    status: bookingStatus("status").notNull().default("confirmed"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    emailSent: boolean("email_sent").default(false).notNull(),
    originalScheduleId: integer("original_schedule_id").references(
      () => schedules.id,
    ),
    rescheduledAt: timestamp("rescheduled_at"),
    // When the seat was handed back without settling what the customer is owed.
    releasedAt: timestamp("released_at"),
  },
  (table) => ({
    // One active (non-cancelled) booking per customer per schedule.
    // Partial so a customer can re-book after cancelling. A released booking is
    // still active here: the customer keeps their claim on a class and cannot
    // re-book this same schedule themselves — Gabrielle reschedules them.
    scheduleEmailActiveUnique: uniqueIndex("bookings_schedule_email_active_idx")
      .on(table.scheduleId, table.customerEmail)
      .where(sql`${table.status} <> 'cancelled'`),
  }),
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: serial("id").primaryKey(),
    scheduleId: integer("schedule_id")
      .references(() => schedules.id, { onDelete: "cascade" })
      .notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    emailSent: boolean("email_sent").default(false).notNull(),
    // Offer state lives here rather than on the booking: accepting removes the
    // entry, so a confirmed booking carries no offer residue. Re-offering the
    // same person overwrites these fields — no offer history is kept.
    offeredAt: timestamp("offered_at"),
    offerExpiresAt: timestamp("offer_expires_at"),
    // Possession of this token is the sole authorisation to take the seat.
    offerToken: text("offer_token").unique(),
    heldBookingId: integer("held_booking_id").references(() => bookings.id),
  },
  (table) => ({
    scheduleEmailUnique: uniqueIndex("waitlist_schedule_email_idx").on(
      table.scheduleId,
      table.customerEmail,
    ),
  }),
);

// Re-export Better Auth tables
export {
  account,
  session,
  user,
  verification,
} from "./auth-schema";

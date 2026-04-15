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
  stripePaymentId: text("stripe_payment_id").notNull(),
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

export const bookings = pgTable("bookings", {
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
});

// Re-export Better Auth tables
export {
  account,
  session,
  user,
  verification,
} from "./auth-schema";

import { db } from "@/lib/db";
import {
  bookings,
  bundles,
  classes,
  schedules,
  waitlistEntries,
} from "@/lib/db/schema";

/**
 * Rows for integration tests: the required columns filled with something
 * plausible, everything overridable. Each helper returns the row Postgres
 * actually stored, so tests read defaults and generated ids from the database
 * rather than restating them.
 */

let counter = 0;
function unique(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

type Insert<T extends { $inferInsert: unknown }> = T["$inferInsert"];

export async function createClass(
  overrides: Partial<Insert<typeof classes>> = {},
) {
  const slug = unique("test-class");
  const [row] = await db
    .insert(classes)
    .values({
      slug,
      category: "class",
      priceInPence: 1500,
      title: `Test class ${slug}`,
      ...overrides,
    })
    .returning();
  return row;
}

export async function createSchedule(
  overrides: Partial<Insert<typeof schedules>> = {},
) {
  const classId = overrides.classId ?? (await createClass()).id;
  const [row] = await db
    .insert(schedules)
    .values({
      date: "2026-03-01",
      startTime: "10:00:00",
      endTime: "11:00:00",
      ...overrides,
      classId,
    })
    .returning();
  return row;
}

export async function createBundle(
  overrides: Partial<Insert<typeof bundles>> = {},
) {
  const [row] = await db
    .insert(bundles)
    .values({
      customerEmail: `${unique("bundle")}@example.com`,
      stripePaymentId: unique("pi"),
      expiresAt: new Date("2026-12-31T00:00:00Z"),
      ...overrides,
    })
    .returning();
  return row;
}

export async function createBooking(
  overrides: Partial<Insert<typeof bookings>> = {},
) {
  const scheduleId = overrides.scheduleId ?? (await createSchedule()).id;
  const [row] = await db
    .insert(bookings)
    .values({
      customerName: "Test Customer",
      customerEmail: `${unique("customer")}@example.com`,
      classTitle: "Test Class",
      ...overrides,
      scheduleId,
    })
    .returning();
  return row;
}

export async function createWaitlistEntry(
  overrides: Partial<Insert<typeof waitlistEntries>> = {},
) {
  const scheduleId = overrides.scheduleId ?? (await createSchedule()).id;
  const [row] = await db
    .insert(waitlistEntries)
    .values({
      customerName: "Test Customer",
      customerEmail: `${unique("waiting")}@example.com`,
      ...overrides,
      scheduleId,
    })
    .returning();
  return row;
}

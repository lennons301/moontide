import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { BOOKING_TYPES, CLASS_CATEGORIES } from "@/lib/classes/categories";
import {
  assertSlugNotRedirected,
  recordSlugRename,
} from "@/lib/classes/slug-redirects";
import { getServicePagePaths } from "@/lib/content/services";
import { db } from "@/lib/db";
import { classes } from "@/lib/db/schema";
import { ApiError, refuse, withAdmin } from "../_lib";

async function revalidateServicePages() {
  const paths = await getServicePagePaths();
  for (const path of paths) {
    revalidatePath(path);
  }
}

const listQuery = z.object({
  // A class dropdown (scheduling, filtering bookings) only ever wants classes
  // that can still be booked, and that has always been every caller until now
  // — so it stays the default. The admin classes page is the one caller that
  // has to manage a deactivated class, which this filter would otherwise hide
  // from it for good. A query string is text, so this is compared as text
  // rather than coerced — `z.coerce.boolean()` reads any non-empty string,
  // including "false", as true.
  all: z.string().optional(),
});

export const GET = withAdmin({ query: listQuery }, async ({ query }) => {
  const result = await db
    .select()
    .from(classes)
    .where(query.all === "true" ? undefined : eq(classes.active, true));
  return NextResponse.json(result);
});

const missingTitle = { error: "Title is required" };
const missingSlug = { error: "Slug is required" };
const badSlug = {
  error: "Slug must be lowercase letters, numbers and hyphens only",
};
const badCategory = {
  error: `Category must be one of: ${CLASS_CATEGORIES.join(", ")}`,
};
const badBookingType = {
  error: `Booking type must be one of: ${BOOKING_TYPES.join(", ")}`,
};
const badPrice = { error: "Price must be greater than 0" };
const badActive = { error: "Active must be true or false" };
const badEligibility = { error: "Bundle eligibility must be true or false" };
const duplicateSlug = { error: "A class with this slug already exists" };

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const createBody = z.object({
  title: z.string(missingTitle).trim().min(1, missingTitle),
  slug: z
    .string(missingSlug)
    .trim()
    .min(1, missingSlug)
    .regex(SLUG_PATTERN, badSlug),
  category: z.enum(CLASS_CATEGORIES, badCategory),
  bookingType: z.enum(BOOKING_TYPES, badBookingType).optional(),
  priceInPence: z.number(badPrice).int(badPrice).positive(badPrice),
  active: z.boolean(badActive).optional(),
  bundleEligible: z.boolean(badEligibility).optional(),
});

/** A duplicate slug is a client mistake, not a fault — `classes.slug` is unique. */
async function insertClass(
  executor: Pick<typeof db, "insert">,
  values: {
    title: string;
    slug: string;
    category: (typeof CLASS_CATEGORIES)[number];
    bookingType?: (typeof BOOKING_TYPES)[number];
    priceInPence: number;
    active?: boolean;
    bundleEligible?: boolean;
  },
) {
  try {
    const [row] = await executor.insert(classes).values(values).returning();
    return row;
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      throw new ApiError(409, duplicateSlug.error);
    }
    throw error;
  }
}

export const POST = withAdmin({ body: createBody }, async ({ body }) => {
  const created = await db.transaction(async (tx) => {
    // A slug some other class was renamed away from is still recorded as its
    // redirect; a new class must not be created at it, or the old link would
    // come to name this unrelated class instead of redirecting.
    const available = await assertSlugNotRedirected(tx, body.slug);
    if (!available.ok) refuse(available);

    return await insertClass(tx, body);
  });

  await revalidateServicePages();

  return NextResponse.json(created, { status: 201 });
});

const missingId = { error: "Missing class ID" };
const classId = z.number(missingId).int(missingId).positive(missingId);

const updateBody = z
  .object({
    id: classId,
    title: z.string(missingTitle).trim().min(1, missingTitle).optional(),
    slug: z
      .string(missingSlug)
      .trim()
      .min(1, missingSlug)
      .regex(SLUG_PATTERN, badSlug)
      .optional(),
    category: z.enum(CLASS_CATEGORIES, badCategory).optional(),
    bookingType: z.enum(BOOKING_TYPES, badBookingType).optional(),
    priceInPence: z
      .number(badPrice)
      .int(badPrice)
      .positive(badPrice)
      .optional(),
    active: z.boolean(badActive).optional(),
    bundleEligible: z.boolean(badEligibility).optional(),
  })
  // A row that names none of the editable fields asks for nothing; the caller
  // meant something by sending it, so say so rather than silently doing
  // nothing.
  .refine(
    (c) =>
      c.title !== undefined ||
      c.slug !== undefined ||
      c.category !== undefined ||
      c.bookingType !== undefined ||
      c.priceInPence !== undefined ||
      c.active !== undefined ||
      c.bundleEligible !== undefined,
    {
      error:
        "Class updates must include a title, slug, category, booking type, price, active state or bundle eligibility",
    },
  );

export const PUT = withAdmin({ body: updateBody }, async ({ body }) => {
  const {
    id,
    title,
    slug,
    category,
    bookingType,
    priceInPence,
    active,
    bundleEligible,
  } = body;

  const updateFields = {
    ...(title !== undefined && { title }),
    ...(slug !== undefined && { slug }),
    ...(category !== undefined && { category }),
    ...(bookingType !== undefined && { bookingType }),
    ...(priceInPence !== undefined && { priceInPence }),
    ...(active !== undefined && { active }),
    ...(bundleEligible !== undefined && { bundleEligible }),
  };

  // Set inside the transaction when this update actually moves the slug, so
  // the statically rendered old-slug page can be revalidated by name once the
  // rename has committed — the catalogue-wide revalidation below only ever
  // lists the class's *new* slug, never the one it just stopped answering to.
  let renamedFrom: string | undefined;

  const updated = await db.transaction(async (tx) => {
    // The redirect is recorded against the slug this class holds *before* the
    // update, so the write has to see it ahead of the rename rather than
    // trust what the request claims that was.
    if (slug !== undefined) {
      const current = await tx
        .select({ slug: classes.slug })
        .from(classes)
        .where(eq(classes.id, id));

      if (current.length === 0) {
        throw new ApiError(404, "Class not found");
      }

      if (current[0].slug !== slug) {
        renamedFrom = current[0].slug;
      }

      const recorded = await recordSlugRename(tx, {
        classId: id,
        oldSlug: current[0].slug,
        newSlug: slug,
      });
      if (!recorded.ok) refuse(recorded);
    }

    try {
      return await tx
        .update(classes)
        .set(updateFields)
        .where(eq(classes.id, id))
        .returning();
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new ApiError(409, duplicateSlug.error);
      }
      throw error;
    }
  });

  if (updated.length === 0) {
    throw new ApiError(404, "Class not found");
  }

  await revalidateServicePages();
  // The old slug's statically rendered page would otherwise keep serving its
  // last-rendered content — old title, no redirect — until the ISR window
  // (`revalidate = 3600` on `/classes/[slug]`) next expires.
  if (renamedFrom) {
    revalidatePath(`/classes/${renamedFrom}`);
  }

  return NextResponse.json(updated[0]);
});

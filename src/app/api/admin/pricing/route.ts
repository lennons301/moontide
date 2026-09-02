import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { bundleConfig, classes } from "@/lib/db/schema";
import { withAdmin } from "../_lib";

export const GET = withAdmin({}, async () => {
  const allClasses = await db
    .select({
      id: classes.id,
      title: classes.title,
      slug: classes.slug,
      priceInPence: classes.priceInPence,
      bundleEligible: classes.bundleEligible,
    })
    .from(classes)
    .where(eq(classes.active, true));

  const activeBundleConfigs = await db
    .select()
    .from(bundleConfig)
    .where(eq(bundleConfig.active, true));

  return NextResponse.json({
    classes: allClasses,
    bundleConfigs: activeBundleConfigs,
  });
});

const id = z.number().int().positive();

const classUpdate = z
  .object({
    id,
    priceInPence: z
      .number()
      .int({ error: "Class prices must be greater than 0" })
      .positive({ error: "Class prices must be greater than 0" })
      .optional(),
    bundleEligible: z.boolean().optional(),
  })
  // A class row that names neither field asks for nothing; the caller meant
  // something by sending it, so say so rather than silently doing nothing.
  .refine(
    (c) => c.priceInPence !== undefined || c.bundleEligible !== undefined,
    {
      error: "Class updates must include a price or bundle eligibility",
    },
  );

const bundleConfigUpdate = z.object({
  id,
  priceInPence: z
    .number()
    .int({ error: "Bundle price must be greater than 0" })
    .positive({ error: "Bundle price must be greater than 0" })
    .optional(),
  credits: z
    .number()
    .int({ error: "Bundle credits must be greater than 0" })
    .positive({ error: "Bundle credits must be greater than 0" })
    .optional(),
  expiryDays: z
    .number()
    .int({ error: "Bundle expiry days must be greater than 0" })
    .positive({ error: "Bundle expiry days must be greater than 0" })
    .optional(),
});

const pricingBody = z
  .object({
    classes: z.array(classUpdate).optional(),
    bundleConfigs: z.array(bundleConfigUpdate).optional(),
  })
  .refine(
    (b) => Boolean(b.classes?.length) || Boolean(b.bundleConfigs?.length),
    { error: "No updates provided" },
  );

export const PUT = withAdmin({ body: pricingBody }, async ({ body }) => {
  const classUpdates = body.classes;
  const bundleConfigUpdates = body.bundleConfigs;

  await db.transaction(async (tx) => {
    if (classUpdates) {
      for (const c of classUpdates) {
        const fields: { priceInPence?: number; bundleEligible?: boolean } = {};
        if (c.priceInPence !== undefined) fields.priceInPence = c.priceInPence;
        if (c.bundleEligible !== undefined)
          fields.bundleEligible = c.bundleEligible;

        await tx.update(classes).set(fields).where(eq(classes.id, c.id));
      }
    }

    if (bundleConfigUpdates) {
      for (const bc of bundleConfigUpdates) {
        const { id: bundleConfigId, ...fields } = bc;
        await tx
          .update(bundleConfig)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(bundleConfig.id, bundleConfigId));
      }
    }
  });

  return NextResponse.json({ success: true });
});

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { bundleConfig } from "@/lib/db/schema";
import { withAdmin } from "../_lib";

export const GET = withAdmin({}, async () => {
  const activeBundleConfigs = await db
    .select()
    .from(bundleConfig)
    .where(eq(bundleConfig.active, true));

  return NextResponse.json({
    bundleConfigs: activeBundleConfigs,
  });
});

const missingRowId = {
  error: "Every update must name the bundle it changes",
};
const badList = { error: "Updates must be sent as a list" };

const id = z.number(missingRowId).int(missingRowId).positive(missingRowId);

const badBundlePrice = { error: "Bundle price must be greater than 0" };
const badCredits = { error: "Bundle credits must be greater than 0" };
const badExpiry = { error: "Bundle expiry days must be greater than 0" };

const bundleConfigUpdate = z.object({
  id,
  priceInPence: z
    .number(badBundlePrice)
    .int(badBundlePrice)
    .positive(badBundlePrice)
    .optional(),
  credits: z.number(badCredits).int(badCredits).positive(badCredits).optional(),
  expiryDays: z.number(badExpiry).int(badExpiry).positive(badExpiry).optional(),
});

const pricingBody = z
  .object({
    bundleConfigs: z.array(bundleConfigUpdate, badList).optional(),
  })
  .refine((b) => Boolean(b.bundleConfigs?.length), {
    error: "No updates provided",
  });

export const PUT = withAdmin({ body: pricingBody }, async ({ body }) => {
  const bundleConfigUpdates = body.bundleConfigs;

  await db.transaction(async (tx) => {
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

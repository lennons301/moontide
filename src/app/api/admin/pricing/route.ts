import { eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { bundleConfig, bundles } from "@/lib/db/schema";
import { ApiError, withAdmin } from "../_lib";

export const GET = withAdmin({}, async () => {
  // Every config, active or not — a retired one has to be visible to be
  // reactivated. Which ones have ever been purchased decides whether the page
  // offers to delete a row outright, or only to deactivate it.
  const [allConfigs, purchasedRows] = await Promise.all([
    db.select().from(bundleConfig),
    db
      .selectDistinct({ bundleConfigId: bundles.bundleConfigId })
      .from(bundles)
      .where(isNotNull(bundles.bundleConfigId)),
  ]);

  const purchasedIds = new Set(purchasedRows.map((r) => r.bundleConfigId));

  return NextResponse.json({
    bundleConfigs: allConfigs.map((bc) => ({
      ...bc,
      purchased: purchasedIds.has(bc.id),
    })),
  });
});

const missingName = { error: "Bundle name is required" };
const duplicateName = { error: "A bundle with this name already exists" };
const badBundlePrice = { error: "Bundle price must be greater than 0" };
const badCredits = { error: "Bundle credits must be greater than 0" };
const badExpiry = { error: "Bundle expiry days must be greater than 0" };
const badActive = { error: "Bundle active state must be true or false" };

const createBody = z.object({
  name: z.string(missingName).trim().min(1, missingName),
  priceInPence: z
    .number(badBundlePrice)
    .int(badBundlePrice)
    .positive(badBundlePrice),
  credits: z.number(badCredits).int(badCredits).positive(badCredits),
  expiryDays: z.number(badExpiry).int(badExpiry).positive(badExpiry),
});

export const POST = withAdmin({ body: createBody }, async ({ body }) => {
  try {
    const [created] = await db.insert(bundleConfig).values(body).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      throw new ApiError(409, duplicateName.error);
    }
    throw error;
  }
});

const missingRowId = {
  error: "Every update must name the bundle it changes",
};
const badList = { error: "Updates must be sent as a list" };

const id = z.number(missingRowId).int(missingRowId).positive(missingRowId);

const bundleConfigUpdate = z.object({
  id,
  priceInPence: z
    .number(badBundlePrice)
    .int(badBundlePrice)
    .positive(badBundlePrice)
    .optional(),
  credits: z.number(badCredits).int(badCredits).positive(badCredits).optional(),
  expiryDays: z.number(badExpiry).int(badExpiry).positive(badExpiry).optional(),
  active: z.boolean(badActive).optional(),
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

const missingBundleConfigId = { error: "Missing bundle ID" };
const bundleConfigId = z
  .number(missingBundleConfigId)
  .int(missingBundleConfigId)
  .positive(missingBundleConfigId);

const deleteBody = z.object({ id: bundleConfigId });

// Hard delete stays reserved for a config nobody has ever bought — deleting one
// that has is the "bundle whose product has gone" degraded path
// (`sendBundleConfigMissingAlert`), not a routine way to retire a product.
// Deactivating is that path.
export const DELETE = withAdmin({ body: deleteBody }, async ({ body }) => {
  const { id: targetId } = body;

  await db.transaction(async (tx) => {
    const purchased = await tx
      .select({ id: bundles.id })
      .from(bundles)
      .where(eq(bundles.bundleConfigId, targetId))
      .limit(1);

    if (purchased.length > 0) {
      throw new ApiError(
        409,
        "This bundle has been purchased and can't be deleted. Deactivate it instead.",
      );
    }

    const deleted = await tx
      .delete(bundleConfig)
      .where(eq(bundleConfig.id, targetId))
      .returning({ id: bundleConfig.id });

    if (deleted.length === 0) {
      throw new ApiError(404, "Bundle not found");
    }
  });

  return NextResponse.json({ success: true });
});

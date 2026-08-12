import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bundleConfig, classes } from "@/lib/db/schema";

export async function GET() {
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
}

interface ClassUpdate {
  id: number;
  priceInPence?: number;
  bundleEligible?: boolean;
}

interface BundleConfigUpdate {
  id: number;
  priceInPence?: number;
  credits?: number;
  expiryDays?: number;
}

export async function PUT(request: Request) {
  const body = await request.json();
  const classUpdates: ClassUpdate[] | undefined = body.classes;
  const bundleConfigUpdates: BundleConfigUpdate[] | undefined =
    body.bundleConfigs;

  if (!classUpdates?.length && !bundleConfigUpdates?.length) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  // Validate class prices
  if (
    classUpdates?.some(
      (c) => c.priceInPence !== undefined && c.priceInPence <= 0,
    )
  ) {
    return NextResponse.json(
      { error: "Class prices must be greater than 0" },
      { status: 400 },
    );
  }

  // Every class update must change something
  if (
    classUpdates?.some(
      (c) => c.priceInPence === undefined && c.bundleEligible === undefined,
    )
  ) {
    return NextResponse.json(
      { error: "Class updates must include a price or bundle eligibility" },
      { status: 400 },
    );
  }

  // Validate bundle config
  if (bundleConfigUpdates) {
    for (const bc of bundleConfigUpdates) {
      if (bc.priceInPence !== undefined && bc.priceInPence <= 0) {
        return NextResponse.json(
          { error: "Bundle price must be greater than 0" },
          { status: 400 },
        );
      }
      if (bc.credits !== undefined && bc.credits <= 0) {
        return NextResponse.json(
          { error: "Bundle credits must be greater than 0" },
          { status: 400 },
        );
      }
      if (bc.expiryDays !== undefined && bc.expiryDays <= 0) {
        return NextResponse.json(
          { error: "Bundle expiry days must be greater than 0" },
          { status: 400 },
        );
      }
    }
  }

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
        const { id, ...fields } = bc;
        await tx
          .update(bundleConfig)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(bundleConfig.id, id));
      }
    }
  });

  return NextResponse.json({ success: true });
}

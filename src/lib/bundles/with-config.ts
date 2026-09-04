import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bundleConfig, bundles } from "@/lib/db/schema";

/**
 * The one join from a bundle to the product it was sold as, and the one way to
 * word a confirmation for it.
 *
 * On `bundleConfigId` — the config the purchase actually recorded — never on
 * `creditsTotal = credits`. That guess names the wrong product the moment two
 * configs sell the same number of classes, which per-class bundle pricing makes
 * the norm ("6× Prenatal" and "6× Yin" both have six credits), and fans one
 * bundle out to a row per matching config. The admin resend was moved onto the
 * recorded column and the overnight retry was left behind on the guess, so the
 * same bundle could be named two different products depending on which path
 * sent the email. Both import this.
 *
 * The join is a LEFT one: a bundle whose product has been deleted, or one bought
 * before the column existed, is still a payment with a customer behind it.
 * Dropping it from an inner join is how a row goes missing with nobody told —
 * so it comes back with no config and each caller says so out loud.
 */

/** `db.select().from(bundles).leftJoin(...)`, ready for a `where`. */
export function selectBundlesWithConfig() {
  return db
    .select()
    .from(bundles)
    .leftJoin(bundleConfig, eq(bundles.bundleConfigId, bundleConfig.id));
}

/** A bundle as the join returns it: the payment, and the product if it is still there. */
export type BundleWithConfig = {
  bundles: { expiresAt: Date | string; customerEmail: string };
  bundle_config: { name: string; credits: number } | null;
};

export type BundleProduct =
  | {
      ok: true;
      customerEmail: string;
      bundleName: string;
      credits: number;
      expiryDate: string;
    }
  | { ok: false; error: string };

/**
 * What the confirmation for this bundle says — or why it cannot be written.
 *
 * A bundle with no product behind it cannot be named, and inventing a name for
 * it would be worse than saying nothing: Gabrielle was already told at purchase
 * time (`sendBundleConfigMissingAlert`), and this is the same fact reaching the
 * two paths that would otherwise send an email about a product that is not there.
 */
export function describeBundleProduct(row: BundleWithConfig): BundleProduct {
  if (!row.bundle_config) {
    return {
      ok: false,
      error:
        "This bundle's product has been deleted, so there is nothing to name in the confirmation",
    };
  }

  return {
    ok: true,
    customerEmail: row.bundles.customerEmail,
    bundleName: row.bundle_config.name,
    credits: row.bundle_config.credits,
    expiryDate: new Date(row.bundles.expiresAt).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
  };
}

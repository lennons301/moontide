/**
 * What a bundle purchase was sold as.
 *
 * The terms — name, credits, expiry days — are written into the Stripe session
 * metadata at checkout, beside the price the customer is charged from the same
 * read. The webhook then grants what the session says rather than what the
 * config row says now, so an edit to pricing between paying and delivery cannot
 * change what she bought: "changes only affect new purchases".
 *
 * The config row is still read, for two things only: the `bundles.bundleConfigId`
 * foreign key, and as the fallback for a session created before the terms were
 * carried. Neither is what the customer is owed.
 */

/** The bundle keys of a `checkout.session.completed` metadata bag. */
export interface BundleSessionMetadata {
  bundleConfigId?: string;
  bundleName?: string;
  bundleCredits?: string;
  bundleExpiryDays?: string;
}

/** The columns of a `bundle_config` row this decision uses. */
export interface BundlePurchaseConfig {
  id: number;
  name: string;
  credits: number;
  expiryDays: number;
}

export interface BundleTerms {
  name: string;
  credits: number;
  expiryDays: number;
  /** The config row to record, or null when it is no longer there. */
  configId: number | null;
}

export type BundleTermsDecision =
  | { ok: true; terms: BundleTerms; source: "session" | "config" }
  | { ok: false; reason: string };

/** Metadata values are strings; anything that is not a positive whole number is absent. */
function positiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * The config id the session names, as a number, or null when the metadata
 * carries nothing parseable — `Number.parseInt(undefined)` is `NaN`, which
 * matches no row and is not something to look up.
 */
export function bundleConfigIdFromSession(
  metadata: BundleSessionMetadata,
): number | null {
  return positiveInteger(metadata.bundleConfigId);
}

/**
 * The terms of the purchase: the session's own, falling back to the config row
 * for sessions created before the terms travelled with them.
 */
export function decideBundleTerms(input: {
  metadata: BundleSessionMetadata;
  config: BundlePurchaseConfig | null;
}): BundleTermsDecision {
  const { metadata, config } = input;

  const credits = positiveInteger(metadata.bundleCredits);
  const expiryDays = positiveInteger(metadata.bundleExpiryDays);
  const name = metadata.bundleName?.trim();

  if (credits !== null && expiryDays !== null && name) {
    return {
      ok: true,
      source: "session",
      terms: { name, credits, expiryDays, configId: config?.id ?? null },
    };
  }

  if (config) {
    return {
      ok: true,
      source: "config",
      terms: {
        name: config.name,
        credits: config.credits,
        expiryDays: config.expiryDays,
        configId: config.id,
      },
    };
  }

  return {
    ok: false,
    reason:
      "the session carries no bundle terms and the config it names is not there",
  };
}

/**
 * When the customer paid. Stripe gives `created` in whole seconds; a session
 * without one (there should be none) falls back to now, which is the old
 * behaviour and never worse than refusing to grant the bundle.
 */
export function bundlePaidAt(created: number | null | undefined): Date {
  if (
    typeof created !== "number" ||
    !Number.isFinite(created) ||
    created <= 0
  ) {
    return new Date();
  }
  return new Date(created * 1000);
}

/**
 * The expiry clock starts when the customer paid, not when the webhook ran —
 * a delayed or retried delivery must not quietly extend the validity window.
 */
export function bundleExpiry(paidAt: Date, expiryDays: number): Date {
  const expiresAt = new Date(paidAt.getTime());
  expiresAt.setDate(expiresAt.getDate() + expiryDays);
  return expiresAt;
}

/**
 * The terms as checkout writes them into the session. Here rather than in the
 * route so the keys the webhook reads back have exactly one definition.
 */
export function bundleTermsMetadata(
  config: BundlePurchaseConfig,
): Record<string, string> {
  return {
    bundleConfigId: String(config.id),
    bundleName: config.name,
    bundleCredits: String(config.credits),
    bundleExpiryDays: String(config.expiryDays),
  };
}

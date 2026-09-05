/**
 * The diff behind the pricing page.
 *
 * `/admin/pricing` edits a form of strings over rows of numbers, and has to
 * answer two questions from the same comparison: what to show Gabrielle in the
 * confirmation prompt, and what to send to the API. Both are here, so the
 * summary can never describe a change the payload does not carry.
 *
 * Only fields that were actually typed into are considered, and only when the
 * value they parse to differs from what is stored — retyping the same price is
 * not a change, and the Save button stays disabled.
 *
 * Class pricing lives on `/admin/classes` now — see `src/lib/admin/rows.ts`
 * and `/api/admin/classes` — so this is bundle config only.
 */

export interface BundleConfigRow {
  id: number;
  name: string;
  priceInPence: number;
  credits: number;
  expiryDays: number;
}

/** Raw form state: what has been typed, keyed by row id. */
export interface PricingEdits {
  bundles: Record<
    number,
    { priceInPence?: string; credits?: string; expiryDays?: string } | undefined
  >;
}

export interface PricingRows {
  bundleConfigs: BundleConfigRow[];
}

export interface BundleUpdate {
  id: number;
  priceInPence?: number;
  credits?: number;
  expiryDays?: number;
}

export function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

/**
 * Pounds as typed → pence. Anything unparseable or negative reads as zero
 * rather than throwing: the field is free text, and a free class is a state the
 * rest of the system already handles.
 */
export function poundsToPence(pounds: string): number {
  const parsed = Number.parseFloat(pounds);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

/** The bundle-config fields that differ from what is stored. */
function bundleChanges(
  rows: BundleConfigRow[],
  edits: PricingEdits,
): BundleUpdate[] {
  const updates: BundleUpdate[] = [];

  for (const bc of rows) {
    const typed = edits.bundles[bc.id];
    if (!typed) continue;

    const update: BundleUpdate = { id: bc.id };

    if (typed.priceInPence !== undefined) {
      const newPence = poundsToPence(typed.priceInPence);
      if (newPence !== bc.priceInPence) update.priceInPence = newPence;
    }
    if (typed.credits !== undefined) {
      const newCredits = Number.parseInt(typed.credits, 10);
      if (newCredits !== bc.credits) update.credits = newCredits;
    }
    if (typed.expiryDays !== undefined) {
      const newDays = Number.parseInt(typed.expiryDays, 10);
      if (newDays !== bc.expiryDays) update.expiryDays = newDays;
    }

    if (
      update.priceInPence !== undefined ||
      update.credits !== undefined ||
      update.expiryDays !== undefined
    ) {
      updates.push(update);
    }
  }

  return updates;
}

/**
 * One line per pending change, in Gabrielle's words, for the confirm dialog.
 * Empty means nothing to save.
 */
export function buildChangeSummary(
  rows: PricingRows,
  edits: PricingEdits,
): string[] {
  const lines: string[] = [];

  const byBundleId = new Map(rows.bundleConfigs.map((bc) => [bc.id, bc]));
  for (const update of bundleChanges(rows.bundleConfigs, edits)) {
    const bc = byBundleId.get(update.id);
    if (!bc) continue;
    if (update.priceInPence !== undefined) {
      lines.push(
        `${bc.name} price: £${penceToPounds(bc.priceInPence)} → £${penceToPounds(update.priceInPence)}`,
      );
    }
    if (update.credits !== undefined) {
      lines.push(`${bc.name} credits: ${bc.credits} → ${update.credits}`);
    }
    if (update.expiryDays !== undefined) {
      lines.push(
        `${bc.name} expiry: ${bc.expiryDays} days → ${update.expiryDays} days`,
      );
    }
  }

  return lines;
}

/**
 * The PUT body for `/api/admin/pricing`. A key is present only when that side
 * has something to change, so an untouched section is never sent.
 */
export function buildPricingPayload(
  rows: PricingRows,
  edits: PricingEdits,
): { bundleConfigs?: BundleUpdate[] } {
  const payload: { bundleConfigs?: BundleUpdate[] } = {};

  const bundleConfigs = bundleChanges(rows.bundleConfigs, edits);
  if (bundleConfigs.length > 0) payload.bundleConfigs = bundleConfigs;

  return payload;
}

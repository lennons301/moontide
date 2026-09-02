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
 */

export interface ClassPriceRow {
  id: number;
  title: string;
  priceInPence: number;
  bundleEligible: boolean;
}

export interface BundleConfigRow {
  id: number;
  name: string;
  priceInPence: number;
  credits: number;
  expiryDays: number;
}

/** Raw form state: what has been typed, keyed by row id. */
export interface PricingEdits {
  classPrices: Record<number, string>;
  classEligibility: Record<number, boolean>;
  bundles: Record<
    number,
    { priceInPence?: string; credits?: string; expiryDays?: string } | undefined
  >;
}

export interface PricingRows {
  classes: ClassPriceRow[];
  bundleConfigs: BundleConfigRow[];
}

export interface ClassUpdate {
  id: number;
  priceInPence?: number;
  bundleEligible?: boolean;
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

/** The class-price and bundle-eligibility fields that differ from what is stored. */
function classChanges(
  rows: ClassPriceRow[],
  edits: PricingEdits,
): ClassUpdate[] {
  const updates: ClassUpdate[] = [];

  for (const c of rows) {
    const update: ClassUpdate = { id: c.id };

    const typedPrice = edits.classPrices[c.id];
    if (typedPrice !== undefined) {
      const newPence = poundsToPence(typedPrice);
      if (newPence !== c.priceInPence) update.priceInPence = newPence;
    }

    const eligible = edits.classEligibility[c.id];
    if (eligible !== undefined && eligible !== c.bundleEligible) {
      update.bundleEligible = eligible;
    }

    if (
      update.priceInPence !== undefined ||
      update.bundleEligible !== undefined
    ) {
      updates.push(update);
    }
  }

  return updates;
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

  const byClassId = new Map(rows.classes.map((c) => [c.id, c]));
  for (const update of classChanges(rows.classes, edits)) {
    const c = byClassId.get(update.id);
    if (!c) continue;
    if (update.priceInPence !== undefined) {
      lines.push(
        `${c.title}: £${penceToPounds(c.priceInPence)} → £${penceToPounds(update.priceInPence)}`,
      );
    }
    if (update.bundleEligible !== undefined) {
      lines.push(
        `${c.title}: ${update.bundleEligible ? "now bookable" : "no longer bookable"} with a bundle`,
      );
    }
  }

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
): { classes?: ClassUpdate[]; bundleConfigs?: BundleUpdate[] } {
  const payload: { classes?: ClassUpdate[]; bundleConfigs?: BundleUpdate[] } =
    {};

  const classes = classChanges(rows.classes, edits);
  if (classes.length > 0) payload.classes = classes;

  const bundleConfigs = bundleChanges(rows.bundleConfigs, edits);
  if (bundleConfigs.length > 0) payload.bundleConfigs = bundleConfigs;

  return payload;
}

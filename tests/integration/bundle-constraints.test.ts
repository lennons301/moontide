import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { bundleConfig, bundles } from "@/lib/db/schema";
import { violatedConstraint } from "./support/constraints";
import { createBundle } from "./support/factories";

/**
 * The backstops under the bundle table. The webhook's own guard is a read, and
 * a read cannot refuse a concurrent write — only Postgres can.
 */

describe("bundles_stripe_payment_id_unique", () => {
  it("refuses a second bundle for the same Stripe payment", async () => {
    await createBundle({ stripePaymentId: "cs_test_bundle" });

    expect(
      await violatedConstraint(
        createBundle({ stripePaymentId: "cs_test_bundle" }),
      ),
    ).toBe("bundles_stripe_payment_id_unique");
  });

  it("lets the second insert pass silently when it is guarded on conflict", async () => {
    const first = await createBundle({
      stripePaymentId: "cs_test_bundle",
      creditsRemaining: 4,
    });

    // What the webhook does with a redelivered event: nothing written, nothing
    // returned, and the credits already spent against the bundle left alone.
    const inserted = await db
      .insert(bundles)
      .values({
        customerEmail: "jane@example.com",
        stripePaymentId: "cs_test_bundle",
        expiresAt: new Date("2026-12-31T00:00:00Z"),
      })
      .onConflictDoNothing({ target: bundles.stripePaymentId })
      .returning({ id: bundles.id });

    expect(inserted).toEqual([]);
    const rows = await db.select().from(bundles);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].creditsRemaining).toBe(4);
  });
});

describe("bundles.bundle_config_id", () => {
  it("refuses a config that does not exist", async () => {
    expect(
      await violatedConstraint(createBundle({ bundleConfigId: 999 })),
    ).toBe("bundles_bundle_config_id_bundle_config_id_fk");
  });

  it("records the config the bundle was bought from", async () => {
    const [config] = await db
      .insert(bundleConfig)
      .values({
        name: "Six class bundle",
        priceInPence: 7500,
        credits: 6,
        expiryDays: 120,
      })
      .returning();

    const bundle = await createBundle({ bundleConfigId: config.id });

    expect(bundle.bundleConfigId).toBe(config.id);
  });

  it("is null when the product cannot be known", async () => {
    const bundle = await createBundle();

    expect(bundle.bundleConfigId).toBeNull();
  });
});

describe("bundles_credits_remaining_within_total", () => {
  const CONSTRAINT = "bundles_credits_remaining_within_total";

  it("refuses a debit that would take a credit the bundle has not got", async () => {
    const bundle = await createBundle({ creditsTotal: 6, creditsRemaining: 0 });

    expect(
      await violatedConstraint(
        db
          .update(bundles)
          .set({ creditsRemaining: sql`${bundles.creditsRemaining} - 1` })
          .where(eq(bundles.id, bundle.id)),
      ),
    ).toBe(CONSTRAINT);

    expect((await readBundle(bundle.id)).creditsRemaining).toBe(0);
  });

  it("refuses a refund past what the bundle was sold with", async () => {
    const bundle = await createBundle({ creditsTotal: 6, creditsRemaining: 6 });

    expect(
      await violatedConstraint(
        db
          .update(bundles)
          .set({ creditsRemaining: 7 })
          .where(eq(bundles.id, bundle.id)),
      ),
    ).toBe(CONSTRAINT);
  });

  it("refuses a bundle that starts outside its own total", async () => {
    expect(
      await violatedConstraint(
        createBundle({ creditsTotal: 6, creditsRemaining: 8 }),
      ),
    ).toBe(CONSTRAINT);
  });

  it("allows a bundle spent exactly to nothing", async () => {
    const bundle = await createBundle({ creditsTotal: 3, creditsRemaining: 1 });

    await db
      .update(bundles)
      .set({ creditsRemaining: 0 })
      .where(eq(bundles.id, bundle.id));

    expect((await readBundle(bundle.id)).creditsRemaining).toBe(0);
  });
});

async function readBundle(id: number) {
  const [row] = await db.select().from(bundles).where(eq(bundles.id, id));
  return row;
}

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { refundCredit, spendCredit } from "@/lib/bundles/credits";
import { db } from "@/lib/db";
import { bundles } from "@/lib/db/schema";
import { createBundle } from "./support/factories";

/**
 * The credit module against a real Postgres. The guard lives in the UPDATE's
 * WHERE clause, so the only interesting question is what two simultaneous
 * debits actually do — which no mock can answer.
 */

async function bundle(id: number) {
  const [row] = await db.select().from(bundles).where(eq(bundles.id, id));
  return row;
}

describe("spendCredit", () => {
  it("takes one credit and reports the balance it left", async () => {
    const purchase = await createBundle({
      creditsTotal: 6,
      creditsRemaining: 4,
    });

    await expect(spendCredit(db, purchase.id)).resolves.toEqual({
      spent: true,
      creditsRemaining: 3,
    });

    expect(await bundle(purchase.id)).toMatchObject({
      creditsRemaining: 3,
      status: "active",
    });
  });

  it("refuses a bundle with nothing left, and spends nothing", async () => {
    const purchase = await createBundle({
      creditsTotal: 6,
      creditsRemaining: 0,
      status: "exhausted",
    });

    await expect(spendCredit(db, purchase.id)).resolves.toEqual({
      spent: false,
    });

    expect((await bundle(purchase.id)).creditsRemaining).toBe(0);
  });

  it("writes nothing for a bundle that does not exist", async () => {
    await expect(spendCredit(db, 424242)).resolves.toEqual({ spent: false });
  });

  it("lets exactly one of several simultaneous debits take the last credit", async () => {
    const purchase = await createBundle({
      creditsTotal: 6,
      creditsRemaining: 1,
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () => spendCredit(db, purchase.id)),
    );

    expect(results.filter((result) => result.spent)).toHaveLength(1);
    expect(await bundle(purchase.id)).toMatchObject({
      creditsRemaining: 0,
      status: "exhausted",
    });
  });
});

describe("refundCredit", () => {
  it("gives one credit back", async () => {
    const purchase = await createBundle({
      creditsTotal: 6,
      creditsRemaining: 2,
    });

    await refundCredit(db, purchase.id);

    expect((await bundle(purchase.id)).creditsRemaining).toBe(3);
  });

  it("brings a spent bundle back to life", async () => {
    const purchase = await createBundle({
      creditsTotal: 6,
      creditsRemaining: 0,
      status: "exhausted",
    });

    await refundCredit(db, purchase.id);

    expect(await bundle(purchase.id)).toMatchObject({
      creditsRemaining: 1,
      status: "active",
    });
  });

  it("never hands back more credits than the bundle was sold with", async () => {
    const purchase = await createBundle({
      creditsTotal: 6,
      creditsRemaining: 6,
    });

    await refundCredit(db, purchase.id);

    expect((await bundle(purchase.id)).creditsRemaining).toBe(6);
  });

  it("leaves an expired bundle expired", async () => {
    // Only exhaustion is undone by a refund: an expiry is a date passing, and
    // a returned credit does not extend the bundle.
    const purchase = await createBundle({
      creditsTotal: 6,
      creditsRemaining: 0,
      status: "expired",
    });

    await refundCredit(db, purchase.id);

    expect(await bundle(purchase.id)).toMatchObject({
      creditsRemaining: 1,
      status: "expired",
    });
  });
});

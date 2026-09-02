import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { spendCredit } from "@/lib/bundles/credits";
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

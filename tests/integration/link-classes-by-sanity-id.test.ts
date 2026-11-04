import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { classes, classSlugRedirects } from "@/lib/db/schema";
import { createClass } from "./support/factories";

/**
 * The one-off migration that backfills `classes.sanityId` (#131, #134) has to
 * work on a database that already migrated past it — global setup already
 * ran it once over an empty `classes` table — so this re-applies it over
 * rows created fresh in each test, the same way
 * `case-variant-reconciliation.test.ts` re-applies 0017.
 */
const MIGRATION = readFileSync(
  "drizzle/migrations/0021_link_classes_by_sanity_id.sql",
  "utf8",
);

async function applyTheMigration() {
  for (const statement of MIGRATION.split("--> statement-breakpoint")) {
    if (statement.trim()) await db.execute(sql.raw(statement));
  }
}

async function sanityIdOf(classId: number) {
  const [row] = await db
    .select({ sanityId: classes.sanityId })
    .from(classes)
    .where(eq(classes.id, classId));
  return row.sanityId;
}

async function redirectsFor(classId: number) {
  return db
    .select()
    .from(classSlugRedirects)
    .where(eq(classSlugRedirects.classId, classId));
}

describe("linking classes to their Sanity document by _id", () => {
  it("backfills the three classes whose slug has never changed", async () => {
    const prenatal = await createClass({ slug: "prenatal" });
    const postnatal = await createClass({ slug: "postnatal" });
    const babyYoga = await createClass({ slug: "baby-yoga" });

    await applyTheMigration();

    expect(await sanityIdOf(prenatal.id)).toBe("service-prenatal");
    expect(await sanityIdOf(postnatal.id)).toBe("service-postnatal");
    expect(await sanityIdOf(babyYoga.id)).toBe("service-baby-yoga");
  });

  it("matches the fourth class by its current slug, on a database that never renamed it", async () => {
    const vinyasa = await createClass({ slug: "vinyasa" });

    await applyTheMigration();

    expect(await sanityIdOf(vinyasa.id)).toBe("service-vinyasa");
  });

  it("matches the fourth class by its rename history, on a database shaped like production", async () => {
    const yincircle = await createClass({ slug: "yincircle" });
    await db
      .insert(classSlugRedirects)
      .values({ slug: "vinyasa", classId: yincircle.id });

    await applyTheMigration();

    expect(await sanityIdOf(yincircle.id)).toBe("service-vinyasa");
  });

  it("redirects the stray homepage slug 'yin' to the class it actually names", async () => {
    const yincircle = await createClass({ slug: "yincircle" });
    await db
      .insert(classSlugRedirects)
      .values({ slug: "vinyasa", classId: yincircle.id });

    await applyTheMigration();

    const redirects = await redirectsFor(yincircle.id);
    expect(redirects.map((r) => r.slug).sort()).toEqual(["vinyasa", "yin"]);
  });

  it("does not redirect 'yin' when a live class already holds that slug", async () => {
    const yincircle = await createClass({ slug: "yincircle" });
    await db
      .insert(classSlugRedirects)
      .values({ slug: "vinyasa", classId: yincircle.id });
    const unrelated = await createClass({ slug: "yin" });

    await applyTheMigration();

    expect(await redirectsFor(yincircle.id)).toEqual([
      expect.objectContaining({ slug: "vinyasa" }),
    ]);
    // The unrelated class keeps its own slug — nothing stole it.
    expect(await sanityIdOf(unrelated.id)).toBeNull();
  });

  it("never overwrites a sanityId a class already carries", async () => {
    const prenatal = await createClass({
      slug: "prenatal",
      sanityId: "already-linked-by-hand",
    });

    await applyTheMigration();

    expect(await sanityIdOf(prenatal.id)).toBe("already-linked-by-hand");
  });

  it("leaves an unrelated class's slug alone", async () => {
    const evening = await createClass({ slug: "evening-flow" });

    await applyTheMigration();

    expect(await sanityIdOf(evening.id)).toBeNull();
  });

  it("can be applied twice without changing the result or erroring", async () => {
    const yincircle = await createClass({ slug: "yincircle" });
    await db
      .insert(classSlugRedirects)
      .values({ slug: "vinyasa", classId: yincircle.id });

    await applyTheMigration();
    await applyTheMigration();

    expect(await sanityIdOf(yincircle.id)).toBe("service-vinyasa");
    const redirects = await redirectsFor(yincircle.id);
    expect(redirects.map((r) => r.slug).sort()).toEqual(["vinyasa", "yin"]);
  });
});

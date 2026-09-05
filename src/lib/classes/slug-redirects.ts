import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { classes, classSlugRedirects } from "@/lib/db/schema";

/**
 * Every slug a class has ever held. Renaming writes here so the old link keeps
 * working; `/classes/[slug]` reads it to send a stale request on to the
 * class's current slug.
 *
 * `classSlugRedirects.classId` always names the class directly rather than
 * the slug it was renamed to, so a chain of renames (A→B→C) resolves to
 * whatever is current in one join, never a hop through B.
 */

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Records that `oldSlug` no longer names the class directly and now redirects
 * to it, as part of changing `classes.slug` to `newSlug`.
 *
 * Two edge cases, both about one slug never meaning two things at once:
 * - Renaming back onto a slug this same class held before must not leave a
 *   redirect from that slug to itself, so the stale entry is removed instead
 *   of re-recorded.
 * - Renaming onto a slug a *different* class's history still claims is a
 *   collision — the requester almost certainly meant something else — so it
 *   is refused rather than left to redirect the wrong way.
 *
 * Does nothing when the slug is not actually changing.
 */
export async function recordSlugRename(
  tx: Transaction,
  {
    classId,
    oldSlug,
    newSlug,
  }: { classId: number; oldSlug: string; newSlug: string },
): Promise<{ ok: true } | { ok: false; error: string; httpStatus: number }> {
  if (oldSlug === newSlug) return { ok: true };

  const clashes = await tx
    .select({ id: classSlugRedirects.id, classId: classSlugRedirects.classId })
    .from(classSlugRedirects)
    .where(eq(classSlugRedirects.slug, newSlug));
  const clash = clashes[0];

  if (clash) {
    if (clash.classId !== classId) {
      return {
        ok: false,
        error: "This slug was previously used by another class",
        httpStatus: 409,
      };
    }
    await tx
      .delete(classSlugRedirects)
      .where(eq(classSlugRedirects.id, clash.id));
  }

  await tx.insert(classSlugRedirects).values({ slug: oldSlug, classId });
  return { ok: true };
}

/**
 * The slug a request should have been made to, or null when `slug` needs no
 * redirect — because it already names a class directly, or because it has
 * never named one at all.
 *
 * Checked in that order: a slug currently live on a class answers null even
 * if it also appears in the redirect history of some other class, which is
 * the collision `recordSlugRename` refuses to create going forward but which
 * a row written before that guard existed could still hold.
 */
export async function resolveCurrentSlug(slug: string): Promise<string | null> {
  const live = await db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.slug, slug));
  if (live.length > 0) return null;

  const redirected = await db
    .select({ slug: classes.slug })
    .from(classSlugRedirects)
    .innerJoin(classes, eq(classSlugRedirects.classId, classes.id))
    .where(eq(classSlugRedirects.slug, slug));

  return redirected[0]?.slug ?? null;
}

import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/admin/classes/route";
import {
  recordSlugRename,
  resolveCurrentSlug,
} from "@/lib/classes/slug-redirects";
import { db } from "@/lib/db";
import { bookings, classes, classSlugRedirects } from "@/lib/db/schema";
import {
  createBooking,
  createClass,
  createSchedule,
} from "./support/factories";

// The route checks the session on every request; here it is always Gabrielle,
// so the rows are what the test is about.
vi.mock(
  "@/lib/auth",
  async () => (await import("../support/admin-session")).authModuleMock,
);

// The route revalidates the service pages on every write. That is a Next.js
// request-scoped API this test runs outside of, and is not what any of these
// tests are about.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

function putClass(body: Record<string, unknown>) {
  return PUT(
    new Request("http://localhost/api/admin/classes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function redirectRowsFor(classId: number) {
  return db
    .select()
    .from(classSlugRedirects)
    .where(eq(classSlugRedirects.classId, classId));
}

/**
 * The redirect table and the booking title snapshot against a real Postgres.
 *
 * Both are SQL that has to execute — a unique constraint that has to refuse a
 * collision, a join that has to resolve a chain of renames in one hop, a
 * column that has to keep its value when the row it was copied from changes —
 * so a mock could only assert the shape of the statement, never that it does
 * what it claims. `tests/admin/classes.test.ts` covers the route's wiring to
 * `recordSlugRename` with a mock; this is the real thing.
 */
describe("renaming a class's slug", () => {
  it("records the old slug and leaves the class reachable at the new one", async () => {
    const cls = await createClass({ slug: "vinyasa" });

    const response = await putClass({ id: cls.id, slug: "autumn-equinox-yin" });

    expect(response.status).toBe(200);
    expect((await response.json()).slug).toBe("autumn-equinox-yin");

    const redirects = await redirectRowsFor(cls.id);
    expect(redirects).toHaveLength(1);
    expect(redirects[0].slug).toBe("vinyasa");

    expect(await resolveCurrentSlug("vinyasa")).toBe("autumn-equinox-yin");
    // The slug in current use needs no redirect.
    expect(await resolveCurrentSlug("autumn-equinox-yin")).toBeNull();
    // A slug nothing has ever held is not a stale link either.
    expect(await resolveCurrentSlug("never-existed")).toBeNull();
  });

  it("resolves a chain of renames to the current slug in one hop", async () => {
    const cls = await createClass({ slug: "slug-a" });

    expect((await putClass({ id: cls.id, slug: "slug-b" })).status).toBe(200);
    expect((await putClass({ id: cls.id, slug: "slug-c" })).status).toBe(200);

    // Two renames, two redirect rows — but both name the class directly, so
    // either one answers with what is current now, not the next link.
    expect(await resolveCurrentSlug("slug-a")).toBe("slug-c");
    expect(await resolveCurrentSlug("slug-b")).toBe("slug-c");
    expect(await resolveCurrentSlug("slug-c")).toBeNull();

    const redirects = await redirectRowsFor(cls.id);
    expect(redirects.map((r) => r.slug).sort()).toEqual(["slug-a", "slug-b"]);
  });

  it("removes the stale redirect when a class is renamed back onto a slug it held before", async () => {
    const cls = await createClass({ slug: "original" });
    await putClass({ id: cls.id, slug: "renamed" });

    const response = await putClass({ id: cls.id, slug: "original" });

    expect(response.status).toBe(200);
    // "original" is live again, not also a redirect to itself.
    expect(await resolveCurrentSlug("original")).toBeNull();
    const redirects = await redirectRowsFor(cls.id);
    expect(redirects.map((r) => r.slug)).toEqual(["renamed"]);
  });

  it("refuses to rename onto a slug still recorded against a different class", async () => {
    const first = await createClass({ slug: "claimed" });
    await putClass({ id: first.id, slug: "claimed-new" });
    const second = await createClass({ slug: "unrelated" });

    const response = await putClass({ id: second.id, slug: "claimed" });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe(
      "This slug was previously used by another class",
    );
    // Refused before the class itself was touched.
    const [row] = await db
      .select()
      .from(classes)
      .where(eq(classes.id, second.id));
    expect(row.slug).toBe("unrelated");
  });

  it("does not record a redirect, or touch the table, when the slug is not actually changing", async () => {
    const cls = await createClass({ slug: "steady" });

    const response = await putClass({
      id: cls.id,
      slug: "steady",
      title: "New Title",
    });

    expect(response.status).toBe(200);
    expect(await redirectRowsFor(cls.id)).toHaveLength(0);
  });
});

describe("a booking's class title", () => {
  it("keeps what it was made with after the class is renamed", async () => {
    const cls = await createClass({
      title: "Autumn Equinox Yin",
      slug: "vinyasa",
    });
    const schedule = await createSchedule({ classId: cls.id });
    const booking = await createBooking({
      scheduleId: schedule.id,
      classTitle: cls.title,
    });

    await putClass({
      id: cls.id,
      title: "Winter Solstice Yin",
      slug: "winter-solstice-yin",
    });

    const [row] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, booking.id));
    expect(row.classTitle).toBe("Autumn Equinox Yin");
  });
});

describe("recordSlugRename", () => {
  it("does nothing when old and new slug are the same", async () => {
    const cls = await createClass({ slug: "unchanged" });

    const result = await db.transaction((tx) =>
      recordSlugRename(tx, {
        classId: cls.id,
        oldSlug: "unchanged",
        newSlug: "unchanged",
      }),
    );

    expect(result).toEqual({ ok: true });
    expect(await redirectRowsFor(cls.id)).toHaveLength(0);
  });
});

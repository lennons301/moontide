import { vi } from "vitest";

/**
 * The `classes` table, stubbed.
 *
 * `getClassCatalogue()` (`src/lib/content/services.ts`) is the one place that
 * reads Postgres for the bookable classes, and any test that renders nav,
 * footer, `/about`, a class detail page or the revalidate route now goes
 * through it. Install what the table holds with:
 *
 * ```ts
 * vi.mock("@/lib/db", async () => (await import("../support/classes")).dbModuleMock);
 * ...
 * givenClassCatalogueHolds([{ slug: "prenatal", title: "Prenatal Yoga", category: "class" }]);
 * ```
 *
 * The mock does not interpret the query's `where`/`orderBy` — it always
 * resolves with whatever rows the test installed, in that order, which is
 * why `getClassCatalogue()` is the only shape this module needs to support.
 */
export interface CatalogueRow {
  slug: string;
  title: string;
  category: "class" | "coaching" | "community";
}

const mockOrderBy = vi.fn();
const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

export const dbModuleMock = {
  db: { select: mockSelect },
};

/** What `getClassCatalogue()` (and so `getService()`) reads back, in order. */
export function givenClassCatalogueHolds(rows: CatalogueRow[]): void {
  mockOrderBy.mockResolvedValue(rows);
}

/** No active classes — the catalogue is empty. */
export function givenClassCatalogueIsEmpty(): void {
  givenClassCatalogueHolds([]);
}

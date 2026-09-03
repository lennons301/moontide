import { describe, expect, it } from "vitest";
import { buildAdminTableFilters } from "@/components/admin/table-filters";

interface Row {
  status: string;
  classId: number;
  date: string;
}

const ACCESSORS = {
  status: (r: Row) => r.status,
  classId: (r: Row) => r.classId,
  date: (r: Row) => r.date,
};

const ROWS: Row[] = [
  { status: "open", classId: 1, date: "2026-05-01" },
  { status: "open", classId: 2, date: "2026-07-01" },
  { status: "cancelled", classId: 1, date: "2026-07-02" },
];

function apply(
  filters: Record<string, (row: Row) => boolean>,
  rows: Row[] = ROWS,
) {
  return rows.filter((row) => Object.values(filters).every((f) => f(row)));
}

const TODAY = "2026-06-01";

describe("buildAdminTableFilters", () => {
  it("adds no predicate for a filter set to all", () => {
    const filters = buildAdminTableFilters(
      { status: "all", classId: "all", time: "all" },
      ACCESSORS,
      TODAY,
    );
    expect(Object.keys(filters)).toEqual([]);
  });

  it("filters by status", () => {
    const filters = buildAdminTableFilters(
      { status: "cancelled", classId: "all", time: "all" },
      ACCESSORS,
      TODAY,
    );
    expect(apply(filters)).toEqual([ROWS[2]]);
  });

  it("compares the class filter as a number, not as the string it arrives as", () => {
    const filters = buildAdminTableFilters(
      { status: "all", classId: "2", time: "all" },
      ACCESSORS,
      TODAY,
    );
    expect(apply(filters)).toEqual([ROWS[1]]);
  });

  it("treats a class starting today as upcoming, not past", () => {
    const today: Row = { status: "open", classId: 3, date: TODAY };
    const upcoming = buildAdminTableFilters(
      { status: "all", classId: "all", time: "upcoming" },
      ACCESSORS,
      TODAY,
    );
    const past = buildAdminTableFilters(
      { status: "all", classId: "all", time: "past" },
      ACCESSORS,
      TODAY,
    );
    expect(apply(upcoming, [today])).toEqual([today]);
    expect(apply(past, [today])).toEqual([]);
  });

  it("splits upcoming from past around today", () => {
    const upcoming = buildAdminTableFilters(
      { status: "all", classId: "all", time: "upcoming" },
      ACCESSORS,
      TODAY,
    );
    expect(apply(upcoming)).toEqual([ROWS[1], ROWS[2]]);

    const past = buildAdminTableFilters(
      { status: "all", classId: "all", time: "past" },
      ACCESSORS,
      TODAY,
    );
    expect(apply(past)).toEqual([ROWS[0]]);
  });

  it("takes a table that only has a status — bundles, messages", () => {
    const filters = buildAdminTableFilters(
      { status: "cancelled" },
      { status: ACCESSORS.status },
      TODAY,
    );
    expect(Object.keys(filters)).toEqual(["status"]);
    expect(apply(filters)).toEqual([ROWS[2]]);
  });

  it("adds no predicate for a part the table did not give an accessor for", () => {
    const filters = buildAdminTableFilters(
      { status: "all", classId: "2", time: "past" },
      { status: ACCESSORS.status },
      TODAY,
    );
    expect(Object.keys(filters)).toEqual([]);
  });

  it("composes the three filters with AND", () => {
    const filters = buildAdminTableFilters(
      { status: "open", classId: "1", time: "past" },
      ACCESSORS,
      TODAY,
    );
    expect(Object.keys(filters).sort()).toEqual(["class", "status", "time"]);
    expect(apply(filters)).toEqual([ROWS[0]]);
  });
});

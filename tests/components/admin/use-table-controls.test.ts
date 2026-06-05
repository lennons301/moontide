import { describe, expect, it } from "vitest";
import {
  deriveTableRows,
  toggleSortState,
} from "@/components/admin/use-table-controls";

interface Row {
  id: number;
  name: string;
  email: string;
  status: string;
  date: string;
}

const SAMPLE: Row[] = [
  {
    id: 1,
    name: "Charlie",
    email: "c@x.com",
    status: "open",
    date: "2026-06-01",
  },
  {
    id: 2,
    name: "Alice",
    email: "a@x.com",
    status: "full",
    date: "2026-06-03",
  },
  { id: 3, name: "Bob", email: "b@x.com", status: "open", date: "2026-06-02" },
];

const CONFIG = {
  sortKeys: {
    name: (r: Row) => r.name,
    date: (r: Row) => r.date,
  },
  searchFields: (r: Row) => [r.name, r.email],
};

describe("toggleSortState", () => {
  it("flips direction when toggling the active column", () => {
    expect(toggleSortState({ key: "date", direction: "asc" }, "date")).toEqual({
      key: "date",
      direction: "desc",
    });
    expect(toggleSortState({ key: "date", direction: "desc" }, "date")).toEqual(
      {
        key: "date",
        direction: "asc",
      },
    );
  });

  it("switches column and resets to asc when toggling a different column", () => {
    expect(toggleSortState({ key: "date", direction: "desc" }, "name")).toEqual(
      {
        key: "name",
        direction: "asc",
      },
    );
  });
});

describe("deriveTableRows", () => {
  it("applies the default sort", () => {
    const result = deriveTableRows(
      SAMPLE,
      "",
      { key: "name", direction: "asc" },
      CONFIG,
    );
    expect(result.map((r) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("respects sort direction", () => {
    const result = deriveTableRows(
      SAMPLE,
      "",
      { key: "name", direction: "desc" },
      CONFIG,
    );
    expect(result.map((r) => r.name)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("filters by case-insensitive substring against all search fields", () => {
    const result = deriveTableRows(
      SAMPLE,
      "B@X",
      { key: "name", direction: "asc" },
      CONFIG,
    );
    expect(result.map((r) => r.name)).toEqual(["Bob"]);
  });

  it("trims and ignores empty search", () => {
    const result = deriveTableRows(
      SAMPLE,
      "   ",
      { key: "name", direction: "asc" },
      CONFIG,
    );
    expect(result).toHaveLength(3);
  });

  it("composes multiple filter predicates with AND", () => {
    const result = deriveTableRows(
      SAMPLE,
      "",
      { key: "name", direction: "asc" },
      {
        ...CONFIG,
        filters: {
          status: (r) => r.status === "open",
          recent: (r) => r.date >= "2026-06-02",
        },
      },
    );
    expect(result.map((r) => r.name)).toEqual(["Bob"]);
  });

  it("returns rows in original order when sort key is not configured", () => {
    const result = deriveTableRows(
      SAMPLE,
      "",
      { key: "unknown", direction: "asc" },
      CONFIG,
    );
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("supports composite sort keys for tiered ordering", () => {
    interface Msg {
      id: number;
      read: boolean;
      createdAt: string;
    }
    const messages: Msg[] = [
      { id: 1, read: true, createdAt: "2026-06-05" },
      { id: 2, read: false, createdAt: "2026-06-01" },
      { id: 3, read: false, createdAt: "2026-06-03" },
      { id: 4, read: true, createdAt: "2026-06-02" },
    ];
    const result = deriveTableRows(
      messages,
      "",
      { key: "received", direction: "desc" },
      {
        sortKeys: {
          received: (r) => (r.read ? "0_" : "1_") + r.createdAt,
        },
        searchFields: () => [],
      },
    );
    // Unread first (newer within group), then read (newer within group).
    expect(result.map((r) => r.id)).toEqual([3, 2, 1, 4]);
  });
});

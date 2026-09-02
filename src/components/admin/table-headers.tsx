"use client";

import { createContext, useContext, useMemo } from "react";
import type { SortState } from "./use-table-controls";

interface TableSortContextValue {
  sort: SortState;
  toggleSort: (key: string) => void;
}

/**
 * Carries the sort state from `useTableControls` down to the header cells, so a
 * sortable column is declared by the two things that differ — its label and its
 * sort key — instead of repeating the same three wiring props at every one.
 */
const TableSortContext = createContext<TableSortContextValue | null>(null);

/**
 * The header row of an admin table: the shared chrome, plus the sort state its
 * children need. Give it `SortHeader` and `PlainHeader` children in column
 * order.
 */
export function SortableHead({
  sort,
  toggleSort,
  children,
}: TableSortContextValue & { children: React.ReactNode }) {
  const value = useMemo(() => ({ sort, toggleSort }), [sort, toggleSort]);
  return (
    <TableSortContext.Provider value={value}>
      <thead className="border-b border-soft-moonstone/20 bg-dawn-light">
        <tr>{children}</tr>
      </thead>
    </TableSortContext.Provider>
  );
}

const HEADING_CLASS =
  "text-xs font-semibold uppercase tracking-wider text-deep-ocean";

/** A column header that re-sorts the table when clicked. */
export function SortHeader({
  label,
  sortKey,
}: {
  label: string;
  sortKey: string;
}) {
  const context = useContext(TableSortContext);
  if (!context) {
    throw new Error("SortHeader must be rendered inside a SortableHead");
  }
  const { sort, toggleSort } = context;
  const active = sort.key === sortKey;
  return (
    <th className="px-4 py-3">
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className={`flex items-center gap-1 ${HEADING_CLASS} hover:text-deep-tide-blue`}
      >
        {label}
        {active && (
          <span aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</span>
        )}
      </button>
    </th>
  );
}

/** A column header for a column the table cannot be sorted by. */
export function PlainHeader({ label }: { label: string }) {
  return <th className={`px-4 py-3 ${HEADING_CLASS}`}>{label}</th>;
}

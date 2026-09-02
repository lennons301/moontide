import { todayString } from "./format-date";

export type TimeFilter = "upcoming" | "past" | "all";

export interface AdminFilterSelection {
  /** A status value, or `"all"` for no status filter. */
  status: string;
  /** A class id as a string, or `"all"` for no class filter. */
  classId: string;
  time: TimeFilter;
}

export interface AdminFilterAccessors<T> {
  status: (row: T) => string;
  classId: (row: T) => number;
  /** The class date as `YYYY-MM-DD`, compared against today as a string. */
  date: (row: T) => string;
}

/**
 * The status / class / upcoming-or-past filter set shared by the schedule and
 * bookings tables. Only the paths to the three fields differ between them, so
 * those are the argument; everything else is the same rule.
 *
 * Returns predicates keyed by name for `useTableControls`, omitting any filter
 * set to "all" — an omitted predicate is cheaper than one that always passes.
 */
export function buildAdminTableFilters<T>(
  selection: AdminFilterSelection,
  accessors: AdminFilterAccessors<T>,
  today: string = todayString(),
): Record<string, (row: T) => boolean> {
  const map: Record<string, (row: T) => boolean> = {};

  if (selection.status !== "all") {
    map.status = (row) => accessors.status(row) === selection.status;
  }
  if (selection.classId !== "all") {
    const id = Number(selection.classId);
    map.class = (row) => accessors.classId(row) === id;
  }
  if (selection.time === "upcoming") {
    map.time = (row) => accessors.date(row) >= today;
  } else if (selection.time === "past") {
    map.time = (row) => accessors.date(row) < today;
  }

  return map;
}

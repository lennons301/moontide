import { todayString } from "./format-date";

export type TimeFilter = "upcoming" | "past" | "all";

/** The Time pills, wherever a table has them. */
export const TIME_FILTER_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

export interface AdminFilterSelection {
  /** A status value, or `"all"` for no status filter. */
  status?: string;
  /** A class id as a string, or `"all"` for no class filter. */
  classId?: string;
  time?: TimeFilter;
}

export interface AdminFilterAccessors<T> {
  status?: (row: T) => string;
  classId?: (row: T) => number;
  /** The class date as `YYYY-MM-DD`, compared against today as a string. */
  date?: (row: T) => string;
}

/**
 * The status / class / upcoming-or-past filter set behind every admin table.
 * Only the paths to the three fields differ between them, so those are the
 * argument; everything else is the same rule.
 *
 * Each part is optional, because not every table has all three: bundles filter
 * on status alone, and messages read read/unread as their status. A table with
 * a filter of its own — "expiring soon" — spreads that predicate in beside
 * these rather than growing a second way of building the map.
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

  const { status, classId, date } = accessors;

  if (status && selection.status && selection.status !== "all") {
    const wanted = selection.status;
    map.status = (row) => status(row) === wanted;
  }
  if (classId && selection.classId && selection.classId !== "all") {
    const id = Number(selection.classId);
    map.class = (row) => classId(row) === id;
  }
  if (date && selection.time === "upcoming") {
    map.time = (row) => date(row) >= today;
  } else if (date && selection.time === "past") {
    map.time = (row) => date(row) < today;
  }

  return map;
}

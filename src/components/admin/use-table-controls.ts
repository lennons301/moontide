import { useCallback, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface TableControlsConfig<T> {
  sortKeys: Record<string, (row: T) => string | number>;
  searchFields: (row: T) => string[];
  /**
   * Filter predicates composed with AND. Pass a stable reference (e.g. wrapped
   * in useMemo at the call site) — a new object every render makes the hook's
   * useMemo a no-op and re-derives rows on every render.
   */
  filters?: Record<string, (row: T) => boolean>;
}

export function toggleSortState(
  current: SortState,
  clicked: string,
): SortState {
  if (current.key === clicked) {
    return {
      key: clicked,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }
  return { key: clicked, direction: "asc" };
}

export function deriveTableRows<T>(
  rows: T[],
  search: string,
  sort: SortState,
  config: TableControlsConfig<T>,
): T[] {
  const filterPredicates = Object.values(config.filters ?? {});
  let result = rows.filter((row) =>
    filterPredicates.every((predicate) => predicate(row)),
  );

  const needle = search.trim().toLowerCase();
  if (needle) {
    result = result.filter((row) =>
      config
        .searchFields(row)
        .some((field) => field.toLowerCase().includes(needle)),
    );
  }

  // Unknown sort key → preserve current (post-filter) order rather than throwing.
  const compareFn = config.sortKeys[sort.key];
  if (compareFn) {
    const directionMultiplier = sort.direction === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      const av = compareFn(a);
      const bv = compareFn(b);
      if (av < bv) return -1 * directionMultiplier;
      if (av > bv) return 1 * directionMultiplier;
      return 0;
    });
  }

  return result;
}

export interface UseTableControlsOptions<T> extends TableControlsConfig<T> {
  rows: T[];
  defaultSort: SortState;
}

export interface UseTableControlsResult<T> {
  rows: T[];
  search: string;
  setSearch: (s: string) => void;
  sort: SortState;
  toggleSort: (key: string) => void;
  total: number;
}

export function useTableControls<T>(
  options: UseTableControlsOptions<T>,
): UseTableControlsResult<T> {
  const { rows, sortKeys, searchFields, filters, defaultSort } = options;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(defaultSort);

  const derivedRows = useMemo(
    () =>
      deriveTableRows(rows, search, sort, {
        sortKeys,
        searchFields,
        filters,
      }),
    [rows, search, sort, sortKeys, searchFields, filters],
  );

  // Empty dep array is intentional: setSort is stable (React-guaranteed) and
  // toggleSortState is a pure module-level fn — no closure over component state.
  const toggleSort = useCallback((key: string) => {
    setSort((current) => toggleSortState(current, key));
  }, []);

  return {
    rows: derivedRows,
    search,
    setSearch,
    sort,
    toggleSort,
    total: rows.length,
  };
}

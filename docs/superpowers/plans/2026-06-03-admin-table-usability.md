# Admin Table Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side sort + filter + search to four admin list pages (Bookings, Schedule, Bundles, Messages), plus sensible per-page default sorts, an unread-messages count badge in the admin nav, and the missing PUT route + client wiring that mark a message as read when it's opened.

**Architecture:** A pure `deriveTableRows(rows, search, sort, config)` function and a `toggleSortState(current, clicked)` helper hold all the logic — both testable from a Node Vitest environment with zero React renderer. A thin `useTableControls` hook wraps them with `useState`/`useMemo`. A small `AdminTableToolbar` component provides the consistent layout for the search box + filter slot. Each page composes its own filter UI and table markup on top of the hook. The admin layout becomes an async Server Component to read the unread count directly from the DB.

**Tech Stack:** Next.js 16 App Router (Server Components + client islands), React 19, Drizzle 0.45 on Postgres, Vitest 4 (Node environment, no React renderer), shadcn `Input`, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-03-admin-table-usability-design.md`

**Branch:** `feat/admin-table-usability` (already checked out, spec already committed at HEAD).

**Reference patterns:**
- Vitest setup with hoisted Drizzle mocks: `tests/api/book-checkout.test.ts`, `tests/admin/waitlist.test.ts`.
- Existing admin page pattern: `src/app/admin/bookings/page.tsx`, `src/app/admin/bundles/page.tsx`.
- Existing layout/server-component shape: `src/app/admin/layout.tsx`.

---

## File Structure

**Create:**
- `src/components/admin/use-table-controls.ts` — pure functions + hook.
- `src/components/admin/admin-table-toolbar.tsx` — presentational toolbar.
- `src/app/api/admin/messages/route.ts` is **extended** (PUT added), not created (the file exists with GET).
- `tests/components/admin/use-table-controls.test.ts` — covers pure functions.
- `tests/admin/messages.test.ts` — covers PUT.

**Modify:**
- `src/app/admin/bookings/page.tsx` — add toolbar + filters + sortable headers.
- `src/app/admin/schedule/page.tsx` — same.
- `src/app/admin/bundles/page.tsx` — same.
- `src/app/admin/messages/page.tsx` — same + call PUT on open + `router.refresh()`.
- `src/app/api/admin/messages/route.ts` — add PUT.
- `src/app/admin/layout.tsx` — async Server Component reading unread count from DB; render badge on the Messages link.

**No changes to:** Pricing page, any of the existing GETs on the bookings/schedules/bundles APIs, or any existing tests (they're all unaffected).

---

## Task 1: Pure table-controls helpers + tests

**Files:**
- Create: `src/components/admin/use-table-controls.ts`
- Create: `tests/components/admin/use-table-controls.test.ts`

The hook itself (a thin `useState`+`useMemo` wrapper) is added in the same file but the tests target the pure functions. The Vitest config has `environment: "node"` (`vitest.config.ts`); we deliberately avoid a React renderer.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/admin/use-table-controls.test.ts`:

```ts
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
  { id: 1, name: "Charlie", email: "c@x.com", status: "open", date: "2026-06-01" },
  { id: 2, name: "Alice",   email: "a@x.com", status: "full", date: "2026-06-03" },
  { id: 3, name: "Bob",     email: "b@x.com", status: "open", date: "2026-06-02" },
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
    expect(toggleSortState({ key: "date", direction: "desc" }, "date")).toEqual({
      key: "date",
      direction: "asc",
    });
  });

  it("switches column and resets to asc when toggling a different column", () => {
    expect(toggleSortState({ key: "date", direction: "desc" }, "name")).toEqual({
      key: "name",
      direction: "asc",
    });
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
      { id: 1, read: true,  createdAt: "2026-06-05" },
      { id: 2, read: false, createdAt: "2026-06-01" },
      { id: 3, read: false, createdAt: "2026-06-03" },
      { id: 4, read: true,  createdAt: "2026-06-02" },
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
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
pnpm exec vitest run tests/components/admin/use-table-controls.test.ts
```

Expected: all tests fail because `@/components/admin/use-table-controls` doesn't exist.

- [ ] **Step 3: Implement the helpers + hook**

Create `src/components/admin/use-table-controls.ts`:

```ts
import { useCallback, useMemo, useState } from "react";

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface TableControlsConfig<T> {
  sortKeys: Record<string, (row: T) => string | number>;
  searchFields: (row: T) => string[];
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
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
pnpm exec vitest run tests/components/admin/use-table-controls.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 5: Type-check + lint**

```bash
just typecheck && just lint
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/use-table-controls.ts tests/components/admin/use-table-controls.test.ts
git commit -m "feat(admin): add useTableControls hook with sort/filter/search helpers"
```

---

## Task 2: AdminTableToolbar component

**Files:**
- Create: `src/components/admin/admin-table-toolbar.tsx`

No tests — purely presentational. The hook tests already cover the logic.

- [ ] **Step 1: Implement**

Create `src/components/admin/admin-table-toolbar.tsx`:

```tsx
"use client";

import type React from "react";
import { Input } from "@/components/ui/input";

interface AdminTableToolbarProps {
  search: string;
  onSearchChange: (s: string) => void;
  searchPlaceholder?: string;
  showing: number;
  total: number;
  children?: React.ReactNode;
}

export function AdminTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search...",
  showing,
  total,
  children,
}: AdminTableToolbarProps) {
  return (
    <div className="mb-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-9 sm:max-w-xs"
        />
        {children && (
          <div className="flex flex-wrap items-center gap-2">{children}</div>
        )}
      </div>
      {showing !== total && (
        <p className="mt-2 text-xs text-deep-ocean/60">
          Showing {showing} of {total}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

```bash
just typecheck && just lint
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/admin-table-toolbar.tsx
git commit -m "feat(admin): add shared AdminTableToolbar component"
```

---

## Task 3: Bookings page integration

**Files:**
- Modify: `src/app/admin/bookings/page.tsx`

The current page renders one table with no sort/filter/search. After this task: a toolbar above the table with a search input + Status / Class / Time filter pills, sortable column headers (Customer, Class, Date, Status), and a default sort of `date ASC` with the Time filter defaulted to "Upcoming".

The page must also fetch active class types from `/api/admin/classes` to populate the Class filter dropdown.

- [ ] **Step 1: Replace the file with the new implementation**

Replace `src/app/admin/bookings/page.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { useTableControls } from "@/components/admin/use-table-controls";

interface BookingRow {
  bookings: {
    id: number;
    scheduleId: number;
    customerName: string;
    customerEmail: string;
    stripePaymentId: string | null;
    bundleId: number | null;
    status: string;
    createdAt: string;
    emailSent: boolean;
  };
  schedules: {
    id: number;
    classId: number;
    date: string;
    startTime: string;
    endTime: string;
    capacity: number;
    bookedCount: number;
    location: string | null;
    status: string;
  };
  classes: {
    id: number;
    slug: string;
    title: string;
    category: string;
    bookingType: string;
    active: boolean;
    priceInPence: number;
  };
}

interface ClassType {
  id: number;
  title: string;
}

type StatusFilter = "all" | "confirmed" | "cancelled" | "waitlisted";
type TimeFilter = "upcoming" | "past" | "all";

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function PillGroup<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-deep-ocean/60">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-deep-tide-blue text-dawn-light"
              : "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-deep-ocean hover:text-deep-tide-blue"
    >
      {label}
      {active && (
        <span aria-hidden="true">
          {direction === "asc" ? "↑" : "↓"}
        </span>
      )}
    </button>
  );
}

export default function BookingsPage() {
  const [allBookings, setAllBookings] = useState<BookingRow[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");

  const fetchBookings = useCallback(async () => {
    const res = await fetch("/api/admin/bookings");
    const data = await res.json();
    setAllBookings(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBookings();
    fetch("/api/admin/classes")
      .then((r) => r.json())
      .then((d) => setClassTypes(d));
  }, [fetchBookings]);

  const filters = useMemo(() => {
    const today = todayString();
    const map: Record<string, (row: BookingRow) => boolean> = {};
    if (statusFilter !== "all") {
      map.status = (row) => row.bookings.status === statusFilter;
    }
    if (classFilter !== "all") {
      const id = Number(classFilter);
      map.class = (row) => row.classes.id === id;
    }
    if (timeFilter === "upcoming") {
      map.time = (row) => row.schedules.date >= today;
    } else if (timeFilter === "past") {
      map.time = (row) => row.schedules.date < today;
    }
    return map;
  }, [statusFilter, classFilter, timeFilter]);

  const { rows, search, setSearch, sort, toggleSort, total } = useTableControls<
    BookingRow
  >({
    rows: allBookings,
    sortKeys: {
      customer: (r) => r.bookings.customerName,
      class: (r) => r.classes.title,
      date: (r) => r.schedules.date,
      status: (r) => r.bookings.status,
    },
    searchFields: (r) => [r.bookings.customerName, r.bookings.customerEmail],
    filters,
    defaultSort: { key: "date", direction: "asc" },
  });

  function statusBadge(status: string) {
    const colours: Record<string, string> = {
      confirmed: "bg-seagrass/20 text-seagrass",
      cancelled: "bg-red-100 text-red-700",
      waitlisted: "bg-ocean-light-blue/20 text-ocean-light-blue",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colours[status] || "bg-gray-100 text-gray-600"}`}
      >
        {status}
      </span>
    );
  }

  function paymentType(row: BookingRow) {
    return row.bookings.bundleId ? "Bundle" : "Stripe";
  }

  async function handleCancel(bookingId: number) {
    if (
      !window.confirm(
        "Cancel this booking? The class slot will be freed. You'll need to refund in Stripe separately.",
      )
    ) {
      return;
    }
    const res = await fetch("/api/admin/bookings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: bookingId, status: "cancelled" }),
    });
    if (res.ok) {
      await fetchBookings();
    }
  }

  async function handleResendEmail(bookingId: number) {
    const res = await fetch("/api/admin/resend-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "booking", id: bookingId }),
    });
    if (res.ok) {
      await fetchBookings();
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Bookings
      </h1>

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name or email..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "confirmed", label: "Confirmed" },
            { value: "cancelled", label: "Cancelled" },
            { value: "waitlisted", label: "Waitlisted" },
          ]}
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-deep-ocean/60">Class:</span>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-7 rounded-full bg-soft-moonstone/30 px-2.5 text-xs text-deep-ocean focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            <option value="all">All</option>
            {classTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <PillGroup
          label="Time"
          value={timeFilter}
          onChange={setTimeFilter}
          options={[
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
            { value: "all", label: "All" },
          ]}
        />
      </AdminTableToolbar>

      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-soft-moonstone/20 bg-dawn-light">
            <tr>
              <th className="px-4 py-3">
                <SortHeader
                  label="Customer"
                  sortKey="customer"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("customer")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Class"
                  sortKey="class"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("class")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Date"
                  sortKey="date"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("date")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Time
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Payment
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Status"
                  sortKey="status"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("status")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  No bookings match the current filters.
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr
                  key={item.bookings.id}
                  className="hover:bg-ocean-light-blue/10"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-deep-tide-blue">
                      {item.bookings.customerName}
                    </div>
                    <div className="text-xs text-deep-ocean/60">
                      {item.bookings.customerEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {item.classes.title}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(item.schedules.date)}
                  </td>
                  <td className="px-4 py-3">
                    {item.schedules.startTime} - {item.schedules.endTime}
                  </td>
                  <td className="px-4 py-3">{paymentType(item)}</td>
                  <td className="px-4 py-3">
                    {statusBadge(item.bookings.status)}
                    {!item.bookings.emailSent && (
                      <button
                        type="button"
                        onClick={() => handleResendEmail(item.bookings.id)}
                        className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-bright-orange/20 text-bright-orange hover:bg-bright-orange/30 transition-colors cursor-pointer"
                      >
                        resend email
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.bookings.status === "confirmed" && (
                      <button
                        type="button"
                        onClick={() => handleCancel(item.bookings.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check, lint, full suite**

```bash
just typecheck && just lint && just test
```

Expected: all exit 0. No tests exercise this page directly so no regressions expected.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/bookings/page.tsx
git commit -m "feat(admin): sort/filter/search on bookings page"
```

---

## Task 4: Schedule page integration

**Files:**
- Modify: `src/app/admin/schedule/page.tsx`

The schedule page is more complex than the others — it has an inline `New Class` / edit form, recurring schedule logic, the waitlist panel, etc. **All of that stays.** Only the table render gets wrapped with the hook.

- [ ] **Step 1: Update the imports**

In `src/app/admin/schedule/page.tsx`, add to the existing imports at the top:

```ts
import { useMemo, useState, useCallback, useEffect } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { useTableControls } from "@/components/admin/use-table-controls";
```

(`useMemo`, `useState`, `useCallback`, `useEffect` are already imported — just add the two `@/components/admin/...` imports alongside them.)

- [ ] **Step 2: Add filter state + PillGroup + SortHeader helpers**

Inside the `SchedulePage` component, after the existing `useState` lines (for `scheduleList`, `classTypes`, `showForm`, `submitting`, `editingId`, `waitlistOpen`, `waitlistSchedule`, `formData`), add:

```ts
type StatusFilter = "all" | "open" | "full" | "cancelled";
type TimeFilter = "upcoming" | "past" | "all";

const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
const [classFilter, setClassFilter] = useState<string>("all");
const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
```

Above the component, after the existing imports/interfaces, add the two helpers shared with the Bookings page (copy them verbatim to keep this task self-contained):

```tsx
function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function PillGroup<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-deep-ocean/60">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-deep-tide-blue text-dawn-light"
              : "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-deep-ocean hover:text-deep-tide-blue"
    >
      {label}
      {active && (
        <span aria-hidden="true">
          {direction === "asc" ? "↑" : "↓"}
        </span>
      )}
    </button>
  );
}
```

(Yes, this duplicates the helpers from Task 3. Lifting them into shared files is a fair follow-up, but we keep them inline here to avoid scope creep — only do that extraction if it becomes painful at integration time.)

- [ ] **Step 3: Compose the filters map and call the hook**

After the new state, inside the component body (after the existing `fetchSchedules` / `fetchClassTypes` callbacks and `useEffect`), add:

```ts
const filters = useMemo(() => {
  const today = todayString();
  const map: Record<string, (row: Schedule) => boolean> = {};
  if (statusFilter !== "all") {
    map.status = (row) => row.schedules.status === statusFilter;
  }
  if (classFilter !== "all") {
    const id = Number(classFilter);
    map.class = (row) => row.classes.id === id;
  }
  if (timeFilter === "upcoming") {
    map.time = (row) => row.schedules.date >= today;
  } else if (timeFilter === "past") {
    map.time = (row) => row.schedules.date < today;
  }
  return map;
}, [statusFilter, classFilter, timeFilter]);

const { rows, search, setSearch, sort, toggleSort, total } = useTableControls<
  Schedule
>({
  rows: scheduleList,
  sortKeys: {
    class: (r) => r.classes.title,
    date: (r) => r.schedules.date,
    booked: (r) =>
      r.schedules.capacity === 0
        ? 0
        : r.schedules.bookedCount / r.schedules.capacity,
  },
  searchFields: (r) => [r.classes.title, r.schedules.location ?? ""],
  filters,
  defaultSort: { key: "date", direction: "asc" },
});
```

- [ ] **Step 4: Replace `scheduleList.map(...)` with `rows.map(...)`**

In the table JSX, find the existing `{scheduleList.length === 0 ? (...) : scheduleList.map((item) => ...)}` block and replace `scheduleList` with `rows`:

```tsx
{scheduleList.length === 0 ? (
  <tr>
    <td colSpan={7} className="px-4 py-8 text-center text-soft-moonstone">
      No scheduled classes yet.
    </td>
  </tr>
) : rows.length === 0 ? (
  <tr>
    <td colSpan={7} className="px-4 py-8 text-center text-soft-moonstone">
      No classes match the current filters.
    </td>
  </tr>
) : (
  rows.map((item) => (
    /* ... existing row markup unchanged ... */
  ))
)}
```

(The outer `scheduleList.length === 0` check stays so the empty-state copy is "No scheduled classes yet" for the truly-empty case, and only flips to "No classes match the current filters" when filters have hidden everything.)

- [ ] **Step 5: Replace the column headers with sortable ones**

Find the existing `<thead>` block:

```tsx
<thead className="border-b border-soft-moonstone/20 bg-dawn-light text-xs uppercase tracking-wider text-deep-ocean">
  <tr>
    <th className="px-4 py-3">Class</th>
    <th className="px-4 py-3">Date</th>
    <th className="px-4 py-3">Time</th>
    <th className="px-4 py-3">Location</th>
    <th className="px-4 py-3">Booked</th>
    <th className="px-4 py-3">Status</th>
    <th className="px-4 py-3">Actions</th>
  </tr>
</thead>
```

Replace with:

```tsx
<thead className="border-b border-soft-moonstone/20 bg-dawn-light">
  <tr>
    <th className="px-4 py-3">
      <SortHeader
        label="Class"
        sortKey="class"
        activeKey={sort.key}
        direction={sort.direction}
        onClick={() => toggleSort("class")}
      />
    </th>
    <th className="px-4 py-3">
      <SortHeader
        label="Date"
        sortKey="date"
        activeKey={sort.key}
        direction={sort.direction}
        onClick={() => toggleSort("date")}
      />
    </th>
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
      Time
    </th>
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
      Location
    </th>
    <th className="px-4 py-3">
      <SortHeader
        label="Booked"
        sortKey="booked"
        activeKey={sort.key}
        direction={sort.direction}
        onClick={() => toggleSort("booked")}
      />
    </th>
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
      Status
    </th>
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
      Actions
    </th>
  </tr>
</thead>
```

- [ ] **Step 6: Add the toolbar above the table**

Find the existing outer `<div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">` (the table container, just after the `{showForm && ( ... )}` block). Immediately BEFORE it, insert the toolbar:

```tsx
<AdminTableToolbar
  search={search}
  onSearchChange={setSearch}
  searchPlaceholder="Search class title or location..."
  showing={rows.length}
  total={total}
>
  <PillGroup
    label="Status"
    value={statusFilter}
    onChange={setStatusFilter}
    options={[
      { value: "all", label: "All" },
      { value: "open", label: "Open" },
      { value: "full", label: "Full" },
      { value: "cancelled", label: "Cancelled" },
    ]}
  />
  <div className="flex items-center gap-1">
    <span className="text-xs text-deep-ocean/60">Class:</span>
    <select
      value={classFilter}
      onChange={(e) => setClassFilter(e.target.value)}
      className="h-7 rounded-full bg-soft-moonstone/30 px-2.5 text-xs text-deep-ocean focus:outline-none focus:ring-2 focus:ring-ring/50"
    >
      <option value="all">All</option>
      {classTypes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  </div>
  <PillGroup
    label="Time"
    value={timeFilter}
    onChange={setTimeFilter}
    options={[
      { value: "upcoming", label: "Upcoming" },
      { value: "past", label: "Past" },
      { value: "all", label: "All" },
    ]}
  />
</AdminTableToolbar>
```

- [ ] **Step 7: Type-check, lint, tests**

```bash
just typecheck && just lint && just test
```

Expected: all exit 0. The existing `tests/admin/schedules.test.ts` only tests the API, not the page — so it's unaffected.

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/schedule/page.tsx
git commit -m "feat(admin): sort/filter/search on schedule page"
```

---

## Task 5: Bundles page integration

**Files:**
- Modify: `src/app/admin/bundles/page.tsx`

- [ ] **Step 1: Replace the file with the new implementation**

Replace `src/app/admin/bundles/page.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { useTableControls } from "@/components/admin/use-table-controls";

interface Bundle {
  id: number;
  customerEmail: string;
  creditsTotal: number;
  creditsRemaining: number;
  stripePaymentId: string;
  purchasedAt: string;
  expiresAt: string;
  status: string;
  emailSent: boolean;
}

type StatusFilter = "all" | "active" | "expired" | "exhausted";

function PillGroup<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-deep-ocean/60">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-deep-tide-blue text-dawn-light"
              : "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: string;
  activeKey: string;
  direction: "asc" | "desc";
  onClick: () => void;
}) {
  const active = sortKey === activeKey;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-deep-ocean hover:text-deep-tide-blue"
    >
      {label}
      {active && (
        <span aria-hidden="true">
          {direction === "asc" ? "↑" : "↓"}
        </span>
      )}
    </button>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BundlesPage() {
  const [allBundles, setAllBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expiringSoon, setExpiringSoon] = useState(false);

  const fetchBundles = useCallback(async () => {
    const res = await fetch("/api/admin/bundles");
    const data = await res.json();
    setAllBundles(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBundles();
  }, [fetchBundles]);

  const filters = useMemo(() => {
    const map: Record<string, (b: Bundle) => boolean> = {};
    if (statusFilter !== "all") {
      map.status = (b) => b.status === statusFilter;
    }
    if (expiringSoon) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 14);
      const cutoffIso = cutoff.toISOString();
      map.expiring = (b) =>
        b.status === "active" && b.expiresAt < cutoffIso;
    }
    return map;
  }, [statusFilter, expiringSoon]);

  const { rows, search, setSearch, sort, toggleSort, total } =
    useTableControls<Bundle>({
      rows: allBundles,
      sortKeys: {
        customer: (b) => b.customerEmail,
        purchased: (b) => b.purchasedAt,
        expires: (b) => b.expiresAt,
        used: (b) => b.creditsTotal - b.creditsRemaining,
      },
      searchFields: (b) => [b.customerEmail],
      filters,
      defaultSort: { key: "expires", direction: "asc" },
    });

  function statusBadge(status: string) {
    const colours: Record<string, string> = {
      active: "bg-seagrass/20 text-seagrass",
      expired: "bg-red-100 text-red-700",
      exhausted: "bg-ocean-light-blue/20 text-ocean-light-blue",
    };
    return (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colours[status] || "bg-gray-100 text-gray-600"}`}
      >
        {status}
      </span>
    );
  }

  async function handleResendEmail(bundleId: number) {
    const res = await fetch("/api/admin/resend-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bundle", id: bundleId }),
    });
    if (res.ok) {
      await fetchBundles();
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Bundles
      </h1>

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search customer email..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "active", label: "Active" },
            { value: "expired", label: "Expired" },
            { value: "exhausted", label: "Exhausted" },
          ]}
        />
        <button
          type="button"
          onClick={() => setExpiringSoon((v) => !v)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            expiringSoon
              ? "bg-bright-orange text-dawn-light"
              : "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
          }`}
        >
          Expiring soon
        </button>
      </AdminTableToolbar>

      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-soft-moonstone/20 bg-dawn-light">
            <tr>
              <th className="px-4 py-3">
                <SortHeader
                  label="Customer"
                  sortKey="customer"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("customer")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Purchased"
                  sortKey="purchased"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("purchased")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Expires"
                  sortKey="expires"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("expires")}
                />
              </th>
              <th className="px-4 py-3">
                <SortHeader
                  label="Credits used"
                  sortKey="used"
                  activeKey={sort.key}
                  direction={sort.direction}
                  onClick={() => toggleSort("used")}
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-deep-ocean">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  Loading...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-soft-moonstone"
                >
                  {allBundles.length === 0
                    ? "No bundles yet."
                    : "No bundles match the current filters."}
                </td>
              </tr>
            ) : (
              rows.map((bundle) => (
                <tr key={bundle.id} className="hover:bg-ocean-light-blue/10">
                  <td className="px-4 py-3 font-medium text-deep-tide-blue">
                    {bundle.customerEmail}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(bundle.purchasedAt)}
                  </td>
                  <td className="px-4 py-3">{formatDate(bundle.expiresAt)}</td>
                  <td className="px-4 py-3">
                    {bundle.creditsTotal - bundle.creditsRemaining}/
                    {bundle.creditsTotal}
                  </td>
                  <td className="px-4 py-3">
                    {statusBadge(bundle.status)}
                    {!bundle.emailSent && (
                      <button
                        type="button"
                        onClick={() => handleResendEmail(bundle.id)}
                        className="ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-bright-orange/20 text-bright-orange hover:bg-bright-orange/30 transition-colors cursor-pointer"
                      >
                        resend email
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Note: the existing Credits column showed `creditsRemaining/creditsTotal`. This version shows credits **used** (`creditsTotal - creditsRemaining`)/`creditsTotal` — matching the new sortable "Credits used" column. Same data, slightly different framing. The header rename makes the sort intuitive.

- [ ] **Step 2: Type-check, lint, tests**

```bash
just typecheck && just lint && just test
```

Expected: all exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/bundles/page.tsx
git commit -m "feat(admin): sort/filter/search on bundles page"
```

---

## Task 6: PUT route on `/api/admin/messages` (TDD)

**Files:**
- Modify: `src/app/api/admin/messages/route.ts`
- Create: `tests/admin/messages.test.ts`

- [ ] **Step 1: Create the failing tests**

Create `tests/admin/messages.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockUpdateSet, mockUpdateWhere, mockUpdateReturning } = vi.hoisted(
  () => {
    const mockUpdateReturning = vi.fn();
    const mockUpdateWhere = vi
      .fn()
      .mockReturnValue({ returning: mockUpdateReturning });
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    return { mockUpdateSet, mockUpdateWhere, mockUpdateReturning };
  },
);

vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  contactSubmissions: { id: "id", read: "read" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col: unknown) => col),
}));

import { PUT } from "@/app/api/admin/messages/route";

function makeRequest(body: unknown) {
  return new Request("http://localhost:3000/api/admin/messages", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/admin/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockReturnValue({ returning: mockUpdateReturning });
    mockUpdateReturning.mockResolvedValue([
      { id: 1, name: "Jane", email: "j@x.com", read: true },
    ]);
  });

  it("returns 400 when id is missing", async () => {
    const response = await PUT(makeRequest({ read: true }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing id");
  });

  it("returns 400 when id is not numeric", async () => {
    const response = await PUT(makeRequest({ id: "abc", read: true }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing id");
  });

  it("returns 404 when message not found", async () => {
    mockUpdateReturning.mockResolvedValue([]);
    const response = await PUT(makeRequest({ id: 999, read: true }));
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Message not found");
  });

  it("returns 200 with the updated row on success", async () => {
    const response = await PUT(makeRequest({ id: 1, read: true }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(1);
    expect(body.read).toBe(true);
    expect(mockUpdateSet).toHaveBeenCalledWith({ read: true });
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
pnpm exec vitest run tests/admin/messages.test.ts
```

Expected: 4 failures — `PUT` is not exported by `@/app/api/admin/messages/route`.

- [ ] **Step 3: Implement PUT**

Replace `src/app/api/admin/messages/route.ts` with:

```ts
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";

export async function GET() {
  const result = await db
    .select()
    .from(contactSubmissions)
    .orderBy(desc(contactSubmissions.createdAt));
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, read } = body as { id?: unknown; read?: boolean };

  const numericId = typeof id === "number" ? id : NaN;
  if (!numericId || Number.isNaN(numericId)) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const updated = await db
    .update(contactSubmissions)
    .set({ read: read === true })
    .where(eq(contactSubmissions.id, numericId))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Message not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(updated[0]);
}
```

- [ ] **Step 4: Run the test — verify it passes**

```bash
pnpm exec vitest run tests/admin/messages.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Type-check + lint**

```bash
just typecheck && just lint
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/messages/route.ts tests/admin/messages.test.ts
git commit -m "feat(admin): add PUT /api/admin/messages to mark read/unread"
```

---

## Task 7: Messages page integration (filters + mark-read)

**Files:**
- Modify: `src/app/admin/messages/page.tsx`

The messages page renders a vertical card list rather than a table. The sort/filter/search work applies the same way; the layout just stays card-style. Also adds the missing PUT call when a message is opened, plus `router.refresh()` to update the layout's unread badge.

- [ ] **Step 1: Replace the file**

Replace `src/app/admin/messages/page.tsx` with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminTableToolbar } from "@/components/admin/admin-table-toolbar";
import { useTableControls } from "@/components/admin/use-table-controls";
import { Button } from "@/components/ui/button";

interface Message {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  createdAt: string;
  read: boolean;
}

type StatusFilter = "all" | "unread" | "read";

function PillGroup<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-deep-ocean/60">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-deep-tide-blue text-dawn-light"
              : "bg-soft-moonstone/30 text-deep-ocean hover:bg-soft-moonstone/50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessagesPage() {
  const router = useRouter();
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const fetchMessages = useCallback(async () => {
    const res = await fetch("/api/admin/messages");
    const data = await res.json();
    setAllMessages(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const filters = useMemo(() => {
    const map: Record<string, (m: Message) => boolean> = {};
    if (statusFilter === "unread") map.read = (m) => !m.read;
    if (statusFilter === "read") map.read = (m) => m.read;
    return map;
  }, [statusFilter]);

  const { rows, search, setSearch, total } = useTableControls<Message>({
    rows: allMessages,
    sortKeys: {
      received: (m) => (m.read ? "0_" : "1_") + m.createdAt,
    },
    searchFields: (m) => [m.name, m.email, m.subject, m.message],
    filters,
    defaultSort: { key: "received", direction: "desc" },
  });

  const selected = allMessages.find((m) => m.id === selectedId);

  async function handleOpen(msg: Message) {
    setSelectedId(msg.id);
    if (msg.read) return;
    // Optimistically mark read locally so the list updates immediately.
    setAllMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? { ...m, read: true } : m)),
    );
    const res = await fetch("/api/admin/messages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: msg.id, read: true }),
    });
    if (res.ok) {
      router.refresh();
    } else {
      // Rollback on failure.
      setAllMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, read: false } : m)),
      );
    }
  }

  if (selected) {
    return (
      <div>
        <Button
          variant="outline"
          onClick={() => setSelectedId(null)}
          className="mb-4"
        >
          &larr; Back to messages
        </Button>

        <div className="rounded-lg border border-soft-moonstone/30 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-deep-tide-blue">
            {selected.subject}
          </h2>
          <div className="mt-2 text-sm text-deep-ocean/60">
            <span className="font-medium text-deep-ocean">{selected.name}</span>{" "}
            &lt;{selected.email}&gt;
          </div>
          <div className="mt-1 text-xs text-deep-ocean/40">
            {formatDate(selected.createdAt)}
          </div>
          <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-deep-ocean">
            {selected.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-deep-tide-blue">
        Messages
      </h1>

      <AdminTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search name, email, subject, or message..."
        showing={rows.length}
        total={total}
      >
        <PillGroup
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread" },
            { value: "read", label: "Read" },
          ]}
        />
      </AdminTableToolbar>

      {loading ? (
        <div className="rounded-lg border border-soft-moonstone/30 bg-white p-8 text-center text-soft-moonstone shadow-sm">
          Loading...
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-soft-moonstone/30 bg-white p-8 text-center text-soft-moonstone shadow-sm">
          {allMessages.length === 0
            ? "No messages yet."
            : "No messages match the current filters."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((msg) => (
            <button
              key={msg.id}
              type="button"
              onClick={() => handleOpen(msg)}
              className={`w-full rounded-lg border p-4 text-left transition-colors ${
                msg.read
                  ? "border-soft-moonstone/30 bg-white hover:bg-dawn-light"
                  : "border-bright-orange/30 bg-bright-orange/5 hover:bg-bright-orange/10"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-sm ${msg.read ? "text-deep-ocean" : "font-bold text-deep-tide-blue"}`}
                  >
                    {msg.subject}
                  </div>
                  <div className="mt-1 truncate text-xs text-deep-ocean/60">
                    {msg.name} &lt;{msg.email}&gt;
                  </div>
                </div>
                <div className="shrink-0 text-xs text-deep-ocean/40">
                  {formatDate(msg.createdAt)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

(There are no column-header sort buttons here because the list is card-style, not a table. The composite default sort is the only ordering — appropriate for v1.)

- [ ] **Step 2: Type-check, lint, tests**

```bash
just typecheck && just lint && just test
```

Expected: all exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/messages/page.tsx
git commit -m "feat(admin): filter/search messages and mark read on open"
```

---

## Task 8: Admin layout — unread Messages badge

**Files:**
- Modify: `src/app/admin/layout.tsx`

The current layout is a non-async function component. We turn it into an async Server Component that reads the unread count directly from the DB.

- [ ] **Step 1: Replace the file**

Replace `src/app/admin/layout.tsx` with:

```tsx
import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";

const adminLinks = [
  { label: "Schedule", href: "/admin/schedule" },
  { label: "Pricing", href: "/admin/pricing" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Bundles", href: "/admin/bundles" },
  { label: "Messages", href: "/admin/messages" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactSubmissions)
    .where(eq(contactSubmissions.read, false));
  const unreadCount = rows[0]?.count ?? 0;

  return (
    <div className="min-h-screen bg-dawn-light">
      <nav className="bg-deep-tide-blue text-dawn-light px-6 py-3">
        <div className="flex items-center justify-between">
          <Link href="/admin" className="font-semibold tracking-wider text-sm">
            MOONTIDE ADMIN
          </Link>
          <div className="flex gap-4 text-sm">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hover:text-bright-orange transition-colors"
              >
                {link.label}
                {link.label === "Messages" && unreadCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-bright-orange px-2 py-0.5 text-xs font-semibold text-dawn-light">
                    {unreadCount}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      <div className="p-6">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint + tests**

```bash
just typecheck && just lint && just test
```

Expected: exit 0. No existing test touches the layout.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(admin): unread messages count badge in admin nav"
```

---

## Task 9: Final regression check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

```bash
just test
```

Expected: all tests pass, with the original 83 plus the new 8 hook tests + 4 PUT tests = **95 passing**.

- [ ] **Step 2: Type-check + lint**

```bash
just typecheck && just lint
```

Expected: both exit 0.

- [ ] **Step 3: Inspect the commit series**

```bash
git log --oneline origin/master..HEAD
```

Expected commits (rough order):
- `docs(admin-usability): design spec ...` (already on branch)
- `feat(admin): add useTableControls hook ...`
- `feat(admin): add shared AdminTableToolbar component`
- `feat(admin): sort/filter/search on bookings page`
- `feat(admin): sort/filter/search on schedule page`
- `feat(admin): sort/filter/search on bundles page`
- `feat(admin): add PUT /api/admin/messages ...`
- `feat(admin): filter/search messages and mark read on open`
- `feat(admin): unread messages count badge in admin nav`

- [ ] **Step 4: Diff summary**

```bash
git diff --stat origin/master..HEAD
```

Confirm only the expected files are touched:
- 2 new files under `src/components/admin/`
- 4 modified pages under `src/app/admin/`
- 1 modified API route (`messages`)
- 1 modified layout
- 2 new test files (hook tests + messages tests)
- 1 docs file (the spec)

No unrelated edits (config, package.json, other features). If anything is off, fix before reporting done.

No commit at this step — the next session decides whether to push / open a PR.

---

## Self-review notes

- **Spec coverage:** every section of `2026-06-03-admin-table-usability-design.md` maps to tasks:
  - Shared building blocks (`useTableControls` + `AdminTableToolbar`) → Tasks 1, 2.
  - Bookings/Schedule/Bundles per-page changes → Tasks 3, 4, 5.
  - Messages PUT route → Task 6.
  - Messages page integration (including mark-read + router.refresh) → Task 7.
  - Admin layout unread badge → Task 8.
  - Tests called out in spec → woven into 1, 6.
  - Out-of-scope items (no server-side filtering, no URL state, no pagination, etc.) — none implemented.
- **No placeholders.** Every step has the exact code, exact commands, exact expected output.
- **Type consistency:** `SortDirection`, `SortState`, `TableControlsConfig<T>`, `UseTableControlsOptions<T>`, `UseTableControlsResult<T>` defined in Task 1 and reused in Tasks 3–7 unchanged. The `deriveTableRows` and `toggleSortState` signatures match across Task 1's implementation and Task 1's tests. The `Schedule` interface keeps the `waitlistCount: number` field added in the prior plan — Task 4 doesn't touch the interface.
- **Cosmetic-only `PillGroup`/`SortHeader` duplication across pages:** noted in Task 4. Acceptable per "Don't introduce abstractions beyond what the task requires" — three pages is the threshold where a shared component would start to pay back; if a follow-up adds more pages, lift them. Not doing it now keeps each page self-contained and the diffs small.

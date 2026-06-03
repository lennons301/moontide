# Admin Table Usability

## Summary

The four list-based admin pages (Bookings, Schedule, Bundles, Messages) currently render every row from creation-date-descending with no sort, filter, search, or pagination. As data accumulates this makes it increasingly tedious to find a specific booking, see what classes are full next week, or spot bundles about to expire.

This work adds client-side sort + filter + search to all four pages via a shared `useTableControls` hook and a small toolbar component, applies sensible per-page default sorts, and adds an unread-message count badge in the admin nav. Pagination, server-side filtering, URL state, and bulk actions are explicitly deferred.

The Pricing page is out of scope — it's a config editor, not a list.

## Background and current behaviour

All four list pages share the same shape today:
- Client component that fetches all rows from `/api/admin/<resource>` on mount.
- Renders one HTML table (or, for Messages, a vertical card list) of every row, ordered by `createdAt DESC` server-side.
- No filter UI, no search, no sort affordance, no row count.

The Messages page also has a known gap: `contact_submissions.read` exists in the schema but no code path ever writes `true` to it, so every message is permanently unread. The badge work surfaces this; the spec closes the loop with a PUT endpoint and a client-side call when a message is opened.

## Shared building blocks

Two new files under `src/components/admin/`.

### `use-table-controls.ts`

A typed React hook that owns sort + filter + search state for any list:

```ts
type SortDirection = "asc" | "desc";

interface UseTableControlsOptions<T> {
  rows: T[];
  sortKeys: Record<string, (row: T) => string | number>;
  defaultSort: { key: string; direction: SortDirection };
  searchFields: (row: T) => string[];
  filters?: Record<string, (row: T) => boolean>;
}

interface UseTableControlsResult<T> {
  rows: T[];                              // filtered + sorted view
  search: string;
  setSearch: (s: string) => void;
  sort: { key: string; direction: SortDirection };
  toggleSort: (key: string) => void;
  total: number;                          // unfiltered length
}

export function useTableControls<T>(
  options: UseTableControlsOptions<T>,
): UseTableControlsResult<T>;
```

Behaviour:
- Initial state: `search = ""`, `sort = defaultSort`, no filters set by the hook itself (the page composes them via the `filters` map).
- `toggleSort(key)`:
  - If `key` matches the current sort column → flip `direction`.
  - Otherwise → switch to `key` with direction `"asc"`.
- Returned `rows` are the result of: apply each filter predicate from the `filters` map (rows must pass *all* active ones), apply the search (case-insensitive substring match against any string returned by `searchFields(row)`), then sort by `sortKeys[sort.key](row)` honouring direction.
- `total` is `rows.length` from the input (so the page can render "Showing N of M" when filters/search are active).
- The hook is pure (no fetch, no router, no persistence).

The `filters` map is what each page uses to plug in status / class / date-range filters. The page renders the filter UI and decides which predicates are "active" by including or omitting them from the map (e.g. when "Status: All" is selected, the page passes no status predicate at all, rather than passing one that always returns true).

### `admin-table-toolbar.tsx`

A small layout component:

```tsx
interface AdminTableToolbarProps {
  search: string;
  onSearchChange: (s: string) => void;
  searchPlaceholder?: string;
  showing: number;
  total: number;
  children?: React.ReactNode; // filter pills/selects rendered on the right
}

export function AdminTableToolbar(props: AdminTableToolbarProps): JSX.Element;
```

Layout:
- A row containing a search `<Input>` (~250px wide) on the left and a `flex gap-2` slot for filter children on the right.
- Below the row, a muted `text-xs text-deep-ocean/60` line reading `Showing {showing} of {total}` — rendered only when `showing !== total`.
- No internal state; purely presentational.

Neither file imports from a specific page. Both are framework-agnostic React + Tailwind.

## Per-page changes

For each page, the same recipe: extract the existing data fetch + table markup into a structure that uses `useTableControls`; add filter pill UI; add column-header sort affordances (a small `↑`/`↓` next to the active column, clickable on all sortable columns); replace the existing "no sort" with the new default.

### Bookings (`src/app/admin/bookings/page.tsx`)

**Filters** (rendered as pill-style segmented controls):
- **Status:** All / Confirmed / Cancelled / Waitlisted.
- **Class:** All / one of the active class types (read from existing `/api/admin/classes`).
- **Time:** Upcoming / Past / All. Predicate compares `item.schedules.date` to today's date string (`YYYY-MM-DD`).

**Search** matches `bookings.customerName` and `bookings.customerEmail`.

**Sortable columns:** Customer (by `customerName`), Class (by `classes.title`), Date (by `schedules.date`), Status (by `bookings.status`).

**Default sort:** `key = "date", direction = "asc"`. Combined with the default Time filter (`"Upcoming"`), Gabrielle lands on the next-upcoming booking at the top.

**Default filter state:** Time = `"Upcoming"`, Status/Class = `"All"`.

### Schedule (`src/app/admin/schedule/page.tsx`)

**Filters:**
- **Status:** All / Open / Full / Cancelled.
- **Class:** All / one of the active types.
- **Time:** Upcoming / Past / All. Same date predicate as Bookings.

**Search** matches `classes.title` and `schedules.location`.

**Sortable columns:** Class, Date, Booked (by the utilisation ratio `bookedCount / capacity`).

**Default sort:** `key = "date", direction = "asc"`.

**Default filter state:** Time = `"Upcoming"`, Status/Class = `"All"`.

Note: the existing inline `New Class` form, edit handler, recurring schedule logic, cancel/delete actions, and waitlist chip + panel are all preserved untouched. Only the table renders through the new controls.

### Bundles (`src/app/admin/bundles/page.tsx`)

**Filters:**
- **Status:** All / Active / Expired / Exhausted.
- **Expiring soon** (toggle pill, not a segmented control): when active, the predicate is `status === "active" AND expiresAt < now + 14 days`.

**Search** matches `bundles.customerEmail`.

**Sortable columns:** Customer (by `customerEmail`), Purchased (by `purchasedAt`), Expires (by `expiresAt`), Credits used (by `creditsTotal - creditsRemaining`).

**Default sort:** `key = "expires", direction = "asc"`. Soonest-expiring at the top.

**Default filter state:** Status = `"All"`, Expiring soon = off.

### Messages (`src/app/admin/messages/page.tsx`)

**Filters:**
- **Status:** All / Unread / Read.

**Search** matches `name`, `email`, `subject`, `message`.

**Sortable columns:** From (by `name`), Subject (by `subject`), Received (by `createdAt`).

**Default sort:** composite — unread first, then `createdAt DESC`. Implemented in the hook config as:

```ts
sortKeys: {
  // ...
  received: (row) =>
    (row.read ? "0_" : "1_") + row.createdAt,
}
```

…with `defaultSort = { key: "received", direction: "desc" }`. With DESC ordering, the `"1_"` prefix on unread rows sorts above the `"0_"` prefix on read rows; within each group the `createdAt` portion sorts newer-first. Other sortable columns (From, Subject) use raw fields and ignore read-status. If the user explicitly clicks the Received header to flip direction to ASC, the composite still applies — read items come first within ASC and older within group. This is a deliberate trade-off: keeps the hook simple, and ASC-by-Received is an uncommon click.

**Default filter state:** Status = `"All"`.

Additional behaviour change required for the badge to ever decrement: when the user clicks a row to view the detail (existing `selectedId` flow), call `PUT /api/admin/messages` with `{ id, read: true }` if `selected.read === false`. Then call `router.refresh()` so the layout re-renders the badge count. Local state updates the message's `read` flag too, so the row in the list reverts to the "read" style if the user goes back.

## API additions

### `PUT /api/admin/messages`

Add a PUT handler to the existing `src/app/api/admin/messages/route.ts`:

```
PUT /api/admin/messages
Body: { id: number, read: boolean }
```

- 400 `"Missing id"` if `id` is missing or non-numeric.
- 404 `"Message not found"` if the row doesn't exist.
- 200 with the updated row on success.

Implementation: `db.update(contactSubmissions).set({ read }).where(eq(contactSubmissions.id, id)).returning()`. Use `.returning()` to detect missing rows.

The existing `GET /api/admin/messages` response shape (an array) is unchanged. No new endpoint for unread-count — the admin layout reads it directly from the DB (see below).

## Admin layout — unread badge

`src/app/admin/layout.tsx` becomes an async Server Component (already not marked `"use client"`, so the change is just to make the default export `async`):

```tsx
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const unreadRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contactSubmissions)
    .where(eq(contactSubmissions.read, false));
  const unreadCount = unreadRows[0]?.count ?? 0;

  // ...render nav, passing unreadCount through to the Messages link
}
```

The existing `adminLinks` array becomes data only. The JSX rendering each link checks for the `Messages` entry and appends a chip when `unreadCount > 0`:

```tsx
{link.label}
{link.label === "Messages" && unreadCount > 0 && (
  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-bright-orange px-2 py-0.5 text-xs font-semibold text-dawn-light">
    {unreadCount}
  </span>
)}
```

Freshness: the layout re-renders on every `/admin/*` route navigation (Next.js App Router default). No polling. If Gabrielle sits on a single admin page without navigating, the badge stays stale until she clicks something — acceptable for v1.

## Tests

Following the existing Vitest + mocks pattern; no DB hits in CI.

### `tests/components/admin/use-table-controls.test.ts` (new)

The most valuable tests in this PR. Cases:
- Initial state returns rows in `defaultSort` order.
- `toggleSort` on the active column flips `asc` ↔ `desc`.
- `toggleSort` on a different column switches `key` and resets direction to `asc`.
- `setSearch` filters case-insensitively across all fields returned by `searchFields`.
- Multiple filters compose with AND: a row is included only if every active filter predicate returns true.
- `total` reflects the unfiltered input length, not the filtered result.
- Composite sort key (the Messages `read ? "1_" : "0_"` prefix pattern) orders unread before read at the same date.

### `tests/admin/messages.test.ts` (new)

- `PUT /api/admin/messages` with missing `id` returns 400.
- `PUT` with a non-existent id returns 404.
- `PUT` with `{ id, read: true }` calls the update chain and returns the updated row.

### Existing tests

- No existing tests touch the four pages directly — no updates needed.
- The existing `tests/admin/schedules.test.ts` is unaffected (schedules GET shape is unchanged).

## Out of scope

- No server-side filtering, sorting, or pagination — purely client-side.
- No URL state for filters; refresh resets to defaults.
- No persistence of filter selections across sessions.
- No bulk actions (e.g. cancel many bookings, mark many messages read at once).
- No polling on the unread badge — refreshes only on navigation.
- No "export to CSV" or printable views.
- No Pricing-page changes — different shape, deferred to a separate spec if needed.
- No changes to the existing `GET /api/admin/messages` response shape.
- No UI/component tests for the page-level filter chips and toolbar — consistent with the rest of the admin code (the hook tests cover the logic; the toolbar is presentational).

# Price Management Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move bundle pricing from hardcoded constants to a database table and add an admin UI for managing class prices and bundle settings.

**Architecture:** New `bundleConfig` Drizzle table (multi-row, future-proof). Admin pricing API (GET/PUT) serves the admin page. Checkout and webhook routes read config from DB instead of constants. Client-side bundle values passed as props from server components.

**Tech Stack:** Next.js 16, Drizzle ORM, Vitest, shadcn/ui

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/db/schema.ts` | Modify | Add `bundleConfig` table definition |
| `drizzle/migrations/XXXX_*.sql` | Create (generated) | Migration for new table |
| `scripts/seed-bundle-config.ts` | Create | Seed initial bundle config row |
| `package.json` | Modify | Add `db:seed-bundle-config` script |
| `tests/api/admin-pricing.test.ts` | Create | Admin pricing API tests |
| `src/app/api/admin/pricing/route.ts` | Create | GET/PUT pricing API |
| `src/app/admin/pricing/page.tsx` | Create | Admin pricing page |
| `src/app/admin/layout.tsx` | Modify | Add Pricing nav link |
| `tests/api/book-checkout.test.ts` | Modify | Mock bundleConfig DB query |
| `src/app/api/book/checkout/route.ts` | Modify | Read bundle config from DB |
| `tests/api/stripe-webhook.test.ts` | Modify | Mock bundleConfig lookup |
| `src/app/api/stripe/webhook/route.ts` | Modify | Read bundle config from Stripe metadata |
| `src/app/book/page.tsx` | Modify | Fetch bundle config, pass as props |
| `src/app/book/booking-client.tsx` | Modify | Receive bundle config as prop |
| `src/app/book/bundle/page.tsx` | Modify | Fetch bundle config from DB (server component) |
| `src/app/book/bundle/bundle-form.tsx` | Create | Client-side bundle purchase form |
| `AGENTS.md` | Modify | Document new table and admin page |

---

### Task 1: Add bundleConfig table to schema

**Files:**
- Modify: `src/lib/db/schema.ts:87` (after bundles table, before bookings)

- [ ] **Step 1: Add the bundleConfig table definition**

In `src/lib/db/schema.ts`, add after the `bundles` table (line 87) and before the `bookings` table:

```typescript
export const bundleConfig = pgTable("bundle_config", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  priceInPence: integer("price_in_pence").notNull(),
  credits: integer("credits").notNull(),
  expiryDays: integer("expiry_days").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

- [ ] **Step 2: Generate the migration**

Run: `doppler run -- pnpm exec drizzle-kit generate`
Expected: A new migration file in `drizzle/migrations/` creating the `bundle_config` table.

- [ ] **Step 3: Apply the migration locally**

Run: `just db-migrate`
Expected: Migration applied successfully.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/
git commit -m "feat: add bundleConfig table schema and migration"
```

---

### Task 2: Add seed script for bundle config

**Files:**
- Create: `scripts/seed-bundle-config.ts`
- Modify: `package.json:14` (add script)

- [ ] **Step 1: Create the seed script**

Create `scripts/seed-bundle-config.ts`:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { bundleConfig } from "../src/lib/db/schema";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function seed() {
  console.log("Seeding bundle config...");

  await db
    .insert(bundleConfig)
    .values({
      name: "6-Class Bundle",
      priceInPence: 6600,
      credits: 6,
      expiryDays: 90,
    })
    .onConflictDoNothing();

  console.log("  - 6-Class Bundle (£66.00, 6 credits, 90 days)");
  console.log("\nBundle config seeded");
  process.exit(0);
}

seed().catch(console.error);
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add after the `db:seed-admin` line:

```json
"db:seed-bundle-config": "tsx scripts/seed-bundle-config.ts",
```

- [ ] **Step 3: Run the seed locally**

Run: `doppler run -- pnpm run db:seed-bundle-config`
Expected: "Bundle config seeded" output, row inserted.

- [ ] **Step 4: Commit**

```bash
git add scripts/seed-bundle-config.ts package.json
git commit -m "feat: add bundle config seed script"
```

---

### Task 3: Admin pricing API — tests

**Files:**
- Create: `tests/api/admin-pricing.test.ts`

- [ ] **Step 1: Write the test file**

Create `tests/api/admin-pricing.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSelectFrom, mockWhere, mockUpdateSet, mockUpdateWhere, mockTransaction } =
  vi.hoisted(() => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockSelectFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockUpdateWhere = vi.fn().mockResolvedValue([]);
    const mockUpdateSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
    const mockTransaction = vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const mockTxUpdateWhere = vi.fn().mockResolvedValue([]);
      const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere });
      const tx = {
        update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
      };
      await fn(tx);
    });
    return { mockSelectFrom, mockWhere, mockUpdateSet, mockUpdateWhere, mockTransaction };
  });

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({ from: mockSelectFrom }),
    update: vi.fn().mockReturnValue({ set: mockUpdateSet }),
    transaction: mockTransaction,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id", priceInPence: "price_in_pence" },
  bundleConfig: { id: "id", active: "active" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
}));

import { GET, PUT } from "@/app/api/admin/pricing/route";

describe("GET /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue([]);
  });

  it("returns classes and bundle configs", async () => {
    const mockClasses = [
      { id: 1, title: "Prenatal Yoga", slug: "prenatal", priceInPence: 1250 },
    ];
    const mockBundleConfigs = [
      { id: 1, name: "6-Class Bundle", priceInPence: 6600, credits: 6, expiryDays: 90, active: true },
    ];

    // First call returns classes (no where clause), second returns bundle configs (with where)
    mockSelectFrom
      .mockReturnValueOnce({ where: vi.fn().mockResolvedValue(mockClasses) })
      .mockReturnValueOnce({ where: vi.fn().mockResolvedValue(mockBundleConfigs) });

    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.classes).toEqual(mockClasses);
    expect(body.bundleConfigs).toEqual(mockBundleConfigs);
  });
});

describe("PUT /api/admin/pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdateWhere.mockResolvedValue([]);
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const mockTxUpdateWhere = vi.fn().mockResolvedValue([]);
      const mockTxUpdateSet = vi.fn().mockReturnValue({ where: mockTxUpdateWhere });
      const tx = {
        update: vi.fn().mockReturnValue({ set: mockTxUpdateSet }),
      };
      await fn(tx);
    });
  });

  it("returns 400 when body is empty", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("No updates provided");
  });

  it("returns 400 for negative class price", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classes: [{ id: 1, priceInPence: -100 }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Class prices must be greater than 0");
  });

  it("returns 400 for zero bundle credits", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleConfigs: [{ id: 1, credits: 0 }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bundle credits must be greater than 0");
  });

  it("returns 400 for zero bundle expiry days", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bundleConfigs: [{ id: 1, expiryDays: 0 }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bundle expiry days must be greater than 0");
  });

  it("updates class prices via transaction", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classes: [{ id: 1, priceInPence: 1400 }] }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("updates bundle config via transaction", async () => {
    const request = new Request("http://localhost:3000/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bundleConfigs: [{ id: 1, priceInPence: 7200, credits: 8 }],
      }),
    });

    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/api/admin-pricing.test.ts`
Expected: FAIL — `@/app/api/admin/pricing/route` does not exist.

- [ ] **Step 3: Commit**

```bash
git add tests/api/admin-pricing.test.ts
git commit -m "test: add admin pricing API tests"
```

---

### Task 4: Admin pricing API — implementation

**Files:**
- Create: `src/app/api/admin/pricing/route.ts`

- [ ] **Step 1: Create the API route**

Create `src/app/api/admin/pricing/route.ts`:

```typescript
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bundleConfig, classes } from "@/lib/db/schema";

export async function GET() {
  const allClasses = await db
    .select({
      id: classes.id,
      title: classes.title,
      slug: classes.slug,
      priceInPence: classes.priceInPence,
    })
    .from(classes)
    .where(eq(classes.active, true));

  const activeBundleConfigs = await db
    .select()
    .from(bundleConfig)
    .where(eq(bundleConfig.active, true));

  return NextResponse.json({
    classes: allClasses,
    bundleConfigs: activeBundleConfigs,
  });
}

interface ClassUpdate {
  id: number;
  priceInPence: number;
}

interface BundleConfigUpdate {
  id: number;
  priceInPence?: number;
  credits?: number;
  expiryDays?: number;
}

export async function PUT(request: Request) {
  const body = await request.json();
  const classUpdates: ClassUpdate[] | undefined = body.classes;
  const bundleConfigUpdates: BundleConfigUpdate[] | undefined = body.bundleConfigs;

  if (!classUpdates?.length && !bundleConfigUpdates?.length) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  // Validate class prices
  if (classUpdates?.some((c) => c.priceInPence <= 0)) {
    return NextResponse.json(
      { error: "Class prices must be greater than 0" },
      { status: 400 },
    );
  }

  // Validate bundle config
  if (bundleConfigUpdates) {
    for (const bc of bundleConfigUpdates) {
      if (bc.priceInPence !== undefined && bc.priceInPence <= 0) {
        return NextResponse.json(
          { error: "Bundle price must be greater than 0" },
          { status: 400 },
        );
      }
      if (bc.credits !== undefined && bc.credits <= 0) {
        return NextResponse.json(
          { error: "Bundle credits must be greater than 0" },
          { status: 400 },
        );
      }
      if (bc.expiryDays !== undefined && bc.expiryDays <= 0) {
        return NextResponse.json(
          { error: "Bundle expiry days must be greater than 0" },
          { status: 400 },
        );
      }
    }
  }

  await db.transaction(async (tx) => {
    if (classUpdates) {
      for (const c of classUpdates) {
        await tx
          .update(classes)
          .set({ priceInPence: c.priceInPence })
          .where(eq(classes.id, c.id));
      }
    }

    if (bundleConfigUpdates) {
      for (const bc of bundleConfigUpdates) {
        const { id, ...fields } = bc;
        await tx
          .update(bundleConfig)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(bundleConfig.id, id));
      }
    }
  });

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm run test -- tests/api/admin-pricing.test.ts`
Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/pricing/route.ts
git commit -m "feat: add admin pricing API (GET/PUT)"
```

---

### Task 5: Admin pricing page and nav link

**Files:**
- Create: `src/app/admin/pricing/page.tsx`
- Modify: `src/app/admin/layout.tsx:4`

- [ ] **Step 1: Add Pricing to admin nav**

In `src/app/admin/layout.tsx`, change the `adminLinks` array (lines 3-8) from:

```typescript
const adminLinks = [
  { label: "Schedule", href: "/admin/schedule" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Bundles", href: "/admin/bundles" },
  { label: "Messages", href: "/admin/messages" },
];
```

to:

```typescript
const adminLinks = [
  { label: "Schedule", href: "/admin/schedule" },
  { label: "Pricing", href: "/admin/pricing" },
  { label: "Bookings", href: "/admin/bookings" },
  { label: "Bundles", href: "/admin/bundles" },
  { label: "Messages", href: "/admin/messages" },
];
```

- [ ] **Step 2: Create the pricing admin page**

Create `src/app/admin/pricing/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ClassPrice {
  id: number;
  title: string;
  slug: string;
  priceInPence: number;
}

interface BundleConfigRow {
  id: number;
  name: string;
  priceInPence: number;
  credits: number;
  expiryDays: number;
  active: boolean;
}

function penceToPounds(pence: number) {
  return (pence / 100).toFixed(2);
}

function poundsToPence(pounds: string) {
  const parsed = Number.parseFloat(pounds);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

export default function PricingPage() {
  const [classes, setClasses] = useState<ClassPrice[]>([]);
  const [bundleConfigs, setBundleConfigs] = useState<BundleConfigRow[]>([]);
  const [classEdits, setClassEdits] = useState<Record<number, string>>({});
  const [bundleEdits, setBundleEdits] = useState<
    Record<number, { priceInPence?: string; credits?: string; expiryDays?: string }>
  >({});
  const [saving, setSaving] = useState(false);

  const fetchPricing = useCallback(async () => {
    const res = await fetch("/api/admin/pricing");
    const data = await res.json();
    setClasses(data.classes);
    setBundleConfigs(data.bundleConfigs);
    setClassEdits({});
    setBundleEdits({});
  }, []);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  function getClassDisplayPrice(c: ClassPrice) {
    return classEdits[c.id] ?? penceToPounds(c.priceInPence);
  }

  function getBundleDisplayValue(
    bc: BundleConfigRow,
    field: "priceInPence" | "credits" | "expiryDays",
  ) {
    const edit = bundleEdits[bc.id]?.[field];
    if (edit !== undefined) return edit;
    if (field === "priceInPence") return penceToPounds(bc.priceInPence);
    return String(bc[field]);
  }

  function buildChangeSummary(): string[] {
    const changes: string[] = [];

    for (const c of classes) {
      if (classEdits[c.id] !== undefined) {
        const newPence = poundsToPence(classEdits[c.id]);
        if (newPence !== c.priceInPence) {
          changes.push(
            `${c.title}: £${penceToPounds(c.priceInPence)} → £${penceToPounds(newPence)}`,
          );
        }
      }
    }

    for (const bc of bundleConfigs) {
      const edits = bundleEdits[bc.id];
      if (!edits) continue;

      if (edits.priceInPence !== undefined) {
        const newPence = poundsToPence(edits.priceInPence);
        if (newPence !== bc.priceInPence) {
          changes.push(
            `${bc.name} price: £${penceToPounds(bc.priceInPence)} → £${penceToPounds(newPence)}`,
          );
        }
      }
      if (edits.credits !== undefined) {
        const newCredits = Number.parseInt(edits.credits, 10);
        if (newCredits !== bc.credits) {
          changes.push(`${bc.name} credits: ${bc.credits} → ${newCredits}`);
        }
      }
      if (edits.expiryDays !== undefined) {
        const newDays = Number.parseInt(edits.expiryDays, 10);
        if (newDays !== bc.expiryDays) {
          changes.push(`${bc.name} expiry: ${bc.expiryDays} days → ${newDays} days`);
        }
      }
    }

    return changes;
  }

  async function handleSave() {
    const changes = buildChangeSummary();
    if (changes.length === 0) return;

    const confirmed = window.confirm(
      `Update pricing?\n\n${changes.join("\n")}\n\nChanges apply to new purchases only.`,
    );
    if (!confirmed) return;

    setSaving(true);

    const classUpdatePayload = classes
      .filter((c) => classEdits[c.id] !== undefined)
      .map((c) => ({ id: c.id, priceInPence: poundsToPence(classEdits[c.id]) }))
      .filter((c) => {
        const original = classes.find((cl) => cl.id === c.id);
        return original && c.priceInPence !== original.priceInPence;
      });

    const bundleUpdatePayload = bundleConfigs
      .filter((bc) => bundleEdits[bc.id])
      .map((bc) => {
        const edits = bundleEdits[bc.id];
        const update: { id: number; priceInPence?: number; credits?: number; expiryDays?: number } =
          { id: bc.id };

        if (edits.priceInPence !== undefined) {
          const newPence = poundsToPence(edits.priceInPence);
          if (newPence !== bc.priceInPence) update.priceInPence = newPence;
        }
        if (edits.credits !== undefined) {
          const newCredits = Number.parseInt(edits.credits, 10);
          if (newCredits !== bc.credits) update.credits = newCredits;
        }
        if (edits.expiryDays !== undefined) {
          const newDays = Number.parseInt(edits.expiryDays, 10);
          if (newDays !== bc.expiryDays) update.expiryDays = newDays;
        }

        return update;
      })
      .filter(
        (u) =>
          u.priceInPence !== undefined ||
          u.credits !== undefined ||
          u.expiryDays !== undefined,
      );

    const payload: Record<string, unknown> = {};
    if (classUpdatePayload.length > 0) payload.classes = classUpdatePayload;
    if (bundleUpdatePayload.length > 0) payload.bundleConfigs = bundleUpdatePayload;

    const res = await fetch("/api/admin/pricing", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      await fetchPricing();
    }

    setSaving(false);
  }

  const hasChanges = buildChangeSummary().length > 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-deep-tide-blue">Pricing</h1>
      </div>

      {/* Class Prices */}
      <div className="overflow-x-auto rounded-lg border border-soft-moonstone/30 bg-white shadow-sm mb-6">
        <div className="px-5 py-3 border-b border-soft-moonstone/20 bg-dawn-light">
          <h2 className="text-xs uppercase tracking-wider text-deep-ocean font-medium">
            Class Prices
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-soft-moonstone/20 text-xs uppercase tracking-wider text-deep-ocean">
            <tr>
              <th className="px-5 py-3">Class</th>
              <th className="px-5 py-3 w-36">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-soft-moonstone/10">
            {classes.map((c) => (
              <tr key={c.id} className="hover:bg-ocean-light-blue/10">
                <td className="px-5 py-3 font-medium text-deep-tide-blue">
                  {c.title}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-1">
                    <span className="text-deep-ocean text-sm">£</span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={getClassDisplayPrice(c)}
                      onChange={(e) =>
                        setClassEdits({ ...classEdits, [c.id]: e.target.value })
                      }
                      className="w-24 h-8"
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bundle Configuration */}
      {bundleConfigs.map((bc) => (
        <div
          key={bc.id}
          className="rounded-lg border border-soft-moonstone/30 bg-white shadow-sm mb-6"
        >
          <div className="px-5 py-3 border-b border-soft-moonstone/20 bg-dawn-light">
            <h2 className="text-xs uppercase tracking-wider text-deep-ocean font-medium">
              {bc.name}
            </h2>
          </div>
          <div className="p-5 grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor={`bundle-price-${bc.id}`}>Bundle Price</Label>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-deep-ocean text-sm">£</span>
                <Input
                  id={`bundle-price-${bc.id}`}
                  type="text"
                  inputMode="decimal"
                  value={getBundleDisplayValue(bc, "priceInPence")}
                  onChange={(e) =>
                    setBundleEdits({
                      ...bundleEdits,
                      [bc.id]: {
                        ...bundleEdits[bc.id],
                        priceInPence: e.target.value,
                      },
                    })
                  }
                  className="h-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor={`bundle-credits-${bc.id}`}>Classes Included</Label>
              <Input
                id={`bundle-credits-${bc.id}`}
                type="number"
                min="1"
                value={getBundleDisplayValue(bc, "credits")}
                onChange={(e) =>
                  setBundleEdits({
                    ...bundleEdits,
                    [bc.id]: {
                      ...bundleEdits[bc.id],
                      credits: e.target.value,
                    },
                  })
                }
                className="mt-1 h-8"
              />
            </div>
            <div>
              <Label htmlFor={`bundle-expiry-${bc.id}`}>Expiry (days)</Label>
              <Input
                id={`bundle-expiry-${bc.id}`}
                type="number"
                min="1"
                value={getBundleDisplayValue(bc, "expiryDays")}
                onChange={(e) =>
                  setBundleEdits({
                    ...bundleEdits,
                    [bc.id]: {
                      ...bundleEdits[bc.id],
                      expiryDays: e.target.value,
                    },
                  })
                }
                className="mt-1 h-8"
              />
            </div>
          </div>
          <div className="px-5 pb-4 text-xs text-deep-ocean/60">
            Changes apply to new purchases only. Existing bundles keep their original terms.
          </div>
        </div>
      ))}

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !hasChanges}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/pricing/page.tsx src/app/admin/layout.tsx
git commit -m "feat: add admin pricing page with class and bundle config editing"
```

---

### Task 6: Update checkout route to read bundle config from DB

**Files:**
- Modify: `src/app/api/book/checkout/route.ts`
- Modify: `tests/api/book-checkout.test.ts`

- [ ] **Step 1: Update the checkout test for bundle purchases**

In `tests/api/book-checkout.test.ts`, add `bundleConfig` to the schema mock (line 38-41). Replace:

```typescript
vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id" },
  schedules: { id: "id", classId: "class_id" },
}));
```

with:

```typescript
vi.mock("@/lib/db/schema", () => ({
  classes: { id: "id" },
  schedules: { id: "id", classId: "class_id" },
  bundleConfig: { id: "id", active: "active" },
}));
```

Then update the bundle purchase test (the `"returns checkout URL for bundle purchase"` test starting at line 216). Replace the entire test with:

```typescript
  it("returns checkout URL for bundle purchase", async () => {
    // Mock bundleConfig query — selectFrom is called for bundle config lookup
    mockSelectFrom.mockReturnValueOnce({
      innerJoin: mockInnerJoin,
      where: vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "6-Class Bundle",
          priceInPence: 6600,
          credits: 6,
          expiryDays: 90,
          active: true,
        },
      ]),
    });

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bundle",
        bundleConfigId: 1,
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.url).toBe("https://checkout.stripe.com/test");

    // Verify Stripe was called with DB-sourced bundle params
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        customer_email: "jane@example.com",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "gbp",
              unit_amount: 6600,
              product_data: expect.objectContaining({
                name: "6-Class Bundle",
                description: "6 classes, valid for 90 days from purchase",
              }),
            }),
            quantity: 1,
          }),
        ],
        metadata: expect.objectContaining({
          type: "bundle",
          bundleConfigId: "1",
          customerEmail: "jane@example.com",
        }),
      }),
    );
  });
```

Also add a test for missing/invalid bundleConfigId after the existing bundle test:

```typescript
  it("returns 400 when bundle config not found", async () => {
    mockSelectFrom.mockReturnValueOnce({
      innerJoin: mockInnerJoin,
      where: vi.fn().mockResolvedValue([]),
    });

    const request = new Request("http://localhost:3000/api/book/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bundle",
        bundleConfigId: 999,
        customerEmail: "jane@example.com",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Bundle configuration not found");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/api/book-checkout.test.ts`
Expected: FAIL — checkout route still uses hardcoded constants.

- [ ] **Step 3: Update the checkout route**

Replace `src/app/api/book/checkout/route.ts` entirely:

```typescript
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bundleConfig, classes, schedules } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const stripe = getStripe();
  const body = await request.json();
  const { type, scheduleId, customerName, customerEmail, bundleConfigId } = body;

  if (!customerEmail) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  if (type === "bundle") {
    const configs = await db
      .select()
      .from(bundleConfig)
      .where(and(eq(bundleConfig.id, bundleConfigId), eq(bundleConfig.active, true)));

    if (configs.length === 0) {
      return NextResponse.json(
        { error: "Bundle configuration not found" },
        { status: 400 },
      );
    }

    const config = configs[0];

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: config.name,
              description: `${config.credits} classes, valid for ${config.expiryDays} days from purchase`,
            },
            unit_amount: config.priceInPence,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: "bundle",
        bundleConfigId: String(config.id),
        customerEmail,
      },
      customer_email: customerEmail,
      success_url: `${process.env.BETTER_AUTH_URL}/book/confirmation?session_id={CHECKOUT_SESSION_ID}&type=bundle`,
      cancel_url: `${process.env.BETTER_AUTH_URL}/book/bundle`,
    });

    return NextResponse.json({ url: session.url });
  }

  // Individual class booking
  if (!scheduleId || !customerName) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  const result = await db
    .select()
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(eq(schedules.id, scheduleId));

  if (result.length === 0) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const schedule = result[0].schedules;
  const classInfo = result[0].classes;

  if (schedule.status !== "open") {
    return NextResponse.json(
      { error: "Class is not available" },
      { status: 400 },
    );
  }

  if (schedule.bookedCount >= schedule.capacity) {
    return NextResponse.json({ error: "Class is full" }, { status: 400 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "gbp",
          product_data: {
            name: classInfo.title,
            description: `${schedule.date} ${schedule.startTime}–${schedule.endTime}`,
          },
          unit_amount: classInfo.priceInPence,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "individual",
      scheduleId: String(scheduleId),
      customerName,
      customerEmail,
    },
    customer_email: customerEmail,
    success_url: `${process.env.BETTER_AUTH_URL}/book/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BETTER_AUTH_URL}/book`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- tests/api/book-checkout.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/book/checkout/route.ts tests/api/book-checkout.test.ts
git commit -m "feat: checkout route reads bundle config from DB"
```

---

### Task 7: Update webhook to read bundle config from Stripe metadata

**Files:**
- Modify: `src/app/api/stripe/webhook/route.ts`
- Modify: `tests/api/stripe-webhook.test.ts`

- [ ] **Step 1: Update the webhook test**

In `tests/api/stripe-webhook.test.ts`, add a mock for the bundleConfig select query. Add to the hoisted mocks (after `mockTransaction`):

```typescript
  const mockBundleConfigWhere = vi.fn().mockResolvedValue([]);
  const mockBundleConfigFrom = vi.fn().mockReturnValue({ where: mockBundleConfigWhere });
  const mockBundleConfigSelect = vi.fn().mockReturnValue({ from: mockBundleConfigFrom });
```

And return them from the hoisted function.

Update the DB mock to include the select chain:

```typescript
vi.mock("@/lib/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    transaction: mockTransaction,
    select: mockBundleConfigSelect,
  },
}));
```

Add `bundleConfig` to the schema mock:

```typescript
vi.mock("@/lib/db/schema", () => ({
  bookings: { id: "id", scheduleId: "schedule_id" },
  bundles: { id: "id" },
  bundleConfig: { id: "id" },
  schedules: { id: "id", bookedCount: "booked_count" },
}));
```

Update the bundle purchase test (`"creates bundle record for bundle purchase"`) to include `bundleConfigId` in metadata and mock the config lookup:

```typescript
  it("creates bundle record for bundle purchase", async () => {
    mockBundleConfigWhere.mockResolvedValue([
      { id: 1, credits: 6, expiryDays: 90 },
    ]);

    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_bundle_456",
          metadata: {
            type: "bundle",
            bundleConfigId: "1",
            customerEmail: "jane@example.com",
          },
        },
      },
    } as unknown as Stripe.Event);

    const request = new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "valid" },
      body: "{}",
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: "jane@example.com",
        stripePaymentId: "cs_test_bundle_456",
        creditsTotal: 6,
        creditsRemaining: 6,
      }),
    );

    // Verify expiresAt is roughly 90 days from now
    const callArgs = mockInsertValues.mock.calls[0][0];
    const expiresAt = callArgs.expiresAt as Date;
    const expectedExpiry = new Date();
    expectedExpiry.setDate(expectedExpiry.getDate() + 90);
    expect(
      Math.abs(expiresAt.getTime() - expectedExpiry.getTime()),
    ).toBeLessThan(5000);
  });
```

Also reset `mockBundleConfigWhere` in `beforeEach`:

```typescript
mockBundleConfigWhere.mockResolvedValue([]);
mockBundleConfigFrom.mockReturnValue({ where: mockBundleConfigWhere });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/api/stripe-webhook.test.ts`
Expected: FAIL — webhook still uses hardcoded values.

- [ ] **Step 3: Update the webhook route**

Replace `src/app/api/stripe/webhook/route.ts` entirely:

```typescript
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookings, bundleConfig, bundles, schedules } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getStripe();
  let event: ReturnType<typeof stripe.webhooks.constructEvent>;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata;

    if (metadata?.type === "individual") {
      const scheduleId = Number.parseInt(metadata.scheduleId, 10);
      await db.transaction(async (tx) => {
        await tx.insert(bookings).values({
          scheduleId,
          customerName: metadata.customerName,
          customerEmail: metadata.customerEmail,
          stripePaymentId: session.id,
        });
        await tx
          .update(schedules)
          .set({ bookedCount: sql`${schedules.bookedCount} + 1` })
          .where(eq(schedules.id, scheduleId));
      });
    } else if (metadata?.type === "bundle") {
      const configId = Number.parseInt(metadata.bundleConfigId, 10);
      const configs = await db
        .select()
        .from(bundleConfig)
        .where(eq(bundleConfig.id, configId));

      const config = configs[0];
      const credits = config?.credits ?? 6;
      const expiryDays = config?.expiryDays ?? 90;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiryDays);

      await db.insert(bundles).values({
        customerEmail: metadata.customerEmail,
        creditsTotal: credits,
        creditsRemaining: credits,
        stripePaymentId: session.id,
        expiresAt,
      });
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- tests/api/stripe-webhook.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stripe/webhook/route.ts tests/api/stripe-webhook.test.ts
git commit -m "feat: webhook reads bundle config from Stripe metadata"
```

---

### Task 8: Update booking pages to use bundle config from DB

**Files:**
- Modify: `src/app/book/page.tsx`
- Modify: `src/app/book/booking-client.tsx`
- Modify: `src/app/book/bundle/page.tsx`

- [ ] **Step 1: Update the book page server component to fetch bundle config**

Replace `src/app/book/page.tsx` entirely:

```tsx
import { and, eq, gte } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { bundleConfig, classes, schedules } from "@/lib/db/schema";
import { BookingClient } from "./booking-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Book a Class — Moontide" };

export default async function BookPage() {
  const today = new Date().toISOString().split("T")[0];
  const upcoming = await db
    .select()
    .from(schedules)
    .innerJoin(classes, eq(schedules.classId, classes.id))
    .where(and(gte(schedules.date, today), eq(schedules.status, "open")));

  const activeBundles = await db
    .select()
    .from(bundleConfig)
    .where(eq(bundleConfig.active, true));

  const activeBundleConfig = activeBundles[0] ?? null;

  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue text-center mb-3">
          Book a Class
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-8" />
        <BookingClient schedules={upcoming} bundleConfig={activeBundleConfig} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Update BookingClient to accept bundle config prop**

In `src/app/book/booking-client.tsx`, change the component signature (line 118) from:

```tsx
export function BookingClient({ schedules }: { schedules: ScheduleRow[] }) {
```

to:

```tsx
type BundleConfig = {
  id: number;
  name: string;
  priceInPence: number;
  credits: number;
  expiryDays: number;
} | null;

export function BookingClient({
  schedules,
  bundleConfig,
}: {
  schedules: ScheduleRow[];
  bundleConfig: BundleConfig;
}) {
```

Then update the bundle banner section (lines 347-361). Replace:

```tsx
      {/* Bundle Banner */}
      <div className="bg-bright-orange/10 border border-bright-orange/30 rounded-lg p-6 text-center">
        <h2 className="text-deep-tide-blue font-heading text-xl mb-1">
          Save with a 6-Class Bundle
        </h2>
        <p className="text-deep-ocean mb-4">
          6 classes for {formatPrice(7500)} &middot; Valid 90 days
        </p>
        <Link
          href="/book/bundle"
          className="inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
        >
          Purchase Bundle &rarr;
        </Link>
      </div>
```

with:

```tsx
      {/* Bundle Banner */}
      {bundleConfig && (
        <div className="bg-bright-orange/10 border border-bright-orange/30 rounded-lg p-6 text-center">
          <h2 className="text-deep-tide-blue font-heading text-xl mb-1">
            Save with a {bundleConfig.name}
          </h2>
          <p className="text-deep-ocean mb-4">
            {bundleConfig.credits} classes for {formatPrice(bundleConfig.priceInPence)} &middot; Valid {bundleConfig.expiryDays} days
          </p>
          <Link
            href="/book/bundle"
            className="inline-block bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold hover:bg-bright-orange/90 transition-colors"
          >
            Purchase Bundle &rarr;
          </Link>
        </div>
      )}
```

Also update the checkout POST for bundle purchases (inside `handleSubmit`, around line 185-194). In the JSON body for the `/api/book/checkout` fetch when `useBundle` falls through to Stripe, no changes needed there — that's for individual class checkout. But we should also update the bundle purchase checkout in the bundle page (next step).

- [ ] **Step 3: Update the bundle purchase page**

Replace `src/app/book/bundle/page.tsx` entirely. Change it from a client component to a server component wrapping a client form:

Create the server component:

```tsx
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bundleConfig } from "@/lib/db/schema";
import { BundleForm } from "./bundle-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Purchase Bundle — Moontide" };

export default async function BookBundlePage() {
  const activeBundles = await db
    .select()
    .from(bundleConfig)
    .where(eq(bundleConfig.active, true));

  const config = activeBundles[0];
  if (!config) {
    redirect("/book");
  }

  return <BundleForm bundleConfig={config} />;
}
```

Create `src/app/book/bundle/bundle-form.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface BundleConfig {
  id: number;
  name: string;
  priceInPence: number;
  credits: number;
  expiryDays: number;
}

function formatPrice(pence: number) {
  return `\u00a3${(pence / 100).toFixed(2)}`;
}

export function BundleForm({ bundleConfig }: { bundleConfig: BundleConfig }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/book/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bundle",
          bundleConfigId: bundleConfig.id,
          customerEmail: email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <section className="py-16 px-6 bg-dawn-light">
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-deep-tide-blue text-center mb-3">
          {bundleConfig.name}
        </h1>
        <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-8" />

        <div className="bg-soft-moonstone/30 rounded-lg p-8 text-center mb-8">
          <p className="text-4xl font-heading text-deep-tide-blue mb-2">
            {formatPrice(bundleConfig.priceInPence)}
          </p>
          <p className="text-deep-ocean">
            {bundleConfig.credits} classes &middot; Valid for {bundleConfig.expiryDays} days
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="h-10"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-bright-orange text-dawn-light hover:bg-bright-orange/90 font-semibold text-base"
          >
            {loading ? "Processing..." : "Purchase Bundle"}
          </Button>
        </form>

        <p className="text-deep-ocean/60 text-sm text-center mt-6 leading-relaxed">
          Your bundle will be linked to your email address. Use the same email
          when booking classes to redeem your credits.
        </p>

        <div className="text-center mt-8">
          <Link
            href="/book"
            className="text-ocean-light-blue hover:text-deep-tide-blue transition-colors text-sm font-medium"
          >
            &larr; Back to classes
          </Link>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run full test suite**

Run: `pnpm run test`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/book/page.tsx src/app/book/booking-client.tsx src/app/book/bundle/page.tsx src/app/book/bundle/bundle-form.tsx
git commit -m "feat: booking pages read bundle config from DB via server components"
```

---

### Task 9: Update documentation

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update AGENTS.md**

Add `bundleConfig` to the project structure under `lib/db/`:

In the Project Structure section, under `lib/db/`, update `schema.ts` description to note the new table:

```
      schema.ts           # Drizzle schema (all tables including bundleConfig + re-exports auth-schema)
```

Add to the admin API section:

```
      pricing/            # GET/PUT class prices and bundle config
```

Add the admin page:

```
    admin/
      ...
      pricing/            # Manage class prices and bundle config
```

Update the bundle pricing convention. Change:

```
- **Prices in pence:** Class prices stored in `classes.priceInPence` (£12.50 / 1250 pence). Bundle price is a constant in the checkout route (£66 / 6600 pence for 6 classes).
```

to:

```
- **Prices in pence:** Class prices stored in `classes.priceInPence`. Bundle config (price, credits, expiry) stored in `bundleConfig` table — editable via admin UI at `/admin/pricing`.
```

Add a new convention:

```
- **Bundle config:** The `bundleConfig` table holds bundle products (price, credits, expiry days). Checkout attaches `bundleConfigId` to Stripe session metadata; webhook reads it back to set credits and expiry on the purchased bundle. Changes only affect new purchases.
```

- [ ] **Step 2: Run lint**

Run: `pnpm exec biome check --write .`
Expected: No errors.

- [ ] **Step 3: Run full test suite**

Run: `pnpm run test`
Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with bundleConfig table and admin pricing page"
```

---

## Post-Implementation

After merging, run the seed on staging and production:

```bash
# Staging
doppler run --config stg -- pnpm run db:seed-bundle-config

# Production
doppler run --config prd -- pnpm run db:seed-bundle-config
```

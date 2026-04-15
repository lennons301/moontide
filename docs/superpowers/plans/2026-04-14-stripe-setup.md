# Stripe Setup & Price Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update class and bundle pricing to confirmed values, add Stripe CLI helper to Justfile, and update documentation.

**Architecture:** Direct edits to hardcoded constants across 6 files. No new files, no schema changes, no new dependencies.

**Tech Stack:** Next.js, Vitest, just

---

## File Map

| File | Action | What changes |
|------|--------|-------------|
| `src/app/api/book/checkout/route.ts` | Modify line 7 | Bundle price 7500 → 6600, remove comment |
| `src/app/book/booking-client.tsx` | Modify line 353 | Bundle display price 7500 → 6600 |
| `src/app/book/bundle/page.tsx` | Modify line 56 | `£75` → `£66` |
| `scripts/seed-classes.ts` | Modify lines 16, 23, 30, 37 | Seed price 1500 → 1250 |
| `tests/api/book-checkout.test.ts` | Modify line 240 | Test assertion 7500 → 6600 |
| `justfile` | Append | Add `stripe-listen` command |
| `AGENTS.md` | Modify line 127 | Pricing docs reference |

---

### Task 1: Update bundle price constant

**Files:**
- Modify: `src/app/api/book/checkout/route.ts:7`

- [ ] **Step 1: Update the constant**

Change line 7 from:
```typescript
const BUNDLE_PRICE_PENCE = 7500; // £75 for 6 classes — Gabrielle to confirm
```
to:
```typescript
const BUNDLE_PRICE_PENCE = 6600;
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `pnpm run test -- tests/api/book-checkout.test.ts`
Expected: FAIL — the bundle test asserts `unit_amount: 7500` which no longer matches.

---

### Task 2: Update bundle checkout test assertion

**Files:**
- Modify: `tests/api/book-checkout.test.ts:240`

- [ ] **Step 1: Update the test assertion**

Change line 240 from:
```typescript
              unit_amount: 7500,
```
to:
```typescript
              unit_amount: 6600,
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `pnpm run test -- tests/api/book-checkout.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/book/checkout/route.ts tests/api/book-checkout.test.ts
git commit -m "fix: update bundle price to £66 (6600 pence)"
```

---

### Task 3: Update bundle display prices in UI

**Files:**
- Modify: `src/app/book/booking-client.tsx:353`
- Modify: `src/app/book/bundle/page.tsx:56`

- [ ] **Step 1: Update booking client bundle banner**

In `src/app/book/booking-client.tsx`, change line 353 from:
```tsx
          6 classes for {formatPrice(7500)} &middot; Valid 90 days
```
to:
```tsx
          6 classes for {formatPrice(6600)} &middot; Valid 90 days
```

- [ ] **Step 2: Update bundle page price**

In `src/app/book/bundle/page.tsx`, change line 56 from:
```tsx
            &pound;75
```
to:
```tsx
            &pound;66
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/book/booking-client.tsx src/app/book/bundle/page.tsx
git commit -m "fix: update bundle display price to £66 in booking UI"
```

---

### Task 4: Update seed class prices

**Files:**
- Modify: `scripts/seed-classes.ts:16,23,30,37`

- [ ] **Step 1: Update all four class prices**

In `scripts/seed-classes.ts`, change all four occurrences of:
```typescript
      priceInPence: 1500,
```
to:
```typescript
      priceInPence: 1250,
```

Lines 16, 23, 30, and 37.

- [ ] **Step 2: Commit**

```bash
git add scripts/seed-classes.ts
git commit -m "fix: update seed class prices to £12.50 (1250 pence)"
```

---

### Task 5: Add Stripe CLI webhook forwarding to Justfile

**Files:**
- Modify: `justfile` (append after line 53)

- [ ] **Step 1: Add the command**

Append to the end of `justfile`:

```just

# Forward Stripe webhooks to local dev server
stripe-listen:
    stripe listen --forward-to localhost:3000/api/stripe/webhook
```

- [ ] **Step 2: Verify it appears in the command list**

Run: `just --list`
Expected: `stripe-listen` appears with its description.

- [ ] **Step 3: Commit**

```bash
git add justfile
git commit -m "chore: add stripe-listen command for local webhook testing"
```

---

### Task 6: Update documentation

**Files:**
- Modify: `AGENTS.md:127`

- [ ] **Step 1: Update AGENTS.md pricing reference**

Change line 127 from:
```markdown
- **Prices in pence:** Class prices stored in `classes.priceInPence`. Bundle price is a constant in the checkout route (£75 / 7500 pence for 6 classes).
```
to:
```markdown
- **Prices in pence:** Class prices stored in `classes.priceInPence` (£12.50 / 1250 pence). Bundle price is a constant in the checkout route (£66 / 6600 pence for 6 classes).
```

- [ ] **Step 2: Run full test suite and lint**

Run: `pnpm run test && pnpm exec biome check --write .`
Expected: All tests pass, no lint errors.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update pricing references in AGENTS.md"
```

---

## Post-Implementation: Ops Runbook

After the code changes are merged, follow the ops runbook in `docs/superpowers/specs/2026-04-14-stripe-setup-design.md` for:

1. Stripe account creation (Gabrielle's business)
2. Test-mode keys → Doppler `dev`
3. Local end-to-end test with test card
4. Production keys → Doppler `prd`
5. Webhook endpoint configuration in Stripe Dashboard
6. Production class price update via Drizzle Studio (`UPDATE classes SET price_in_pence = 1250`)

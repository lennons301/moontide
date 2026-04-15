# Price Management Admin

## Summary

Move bundle pricing from hardcoded constants to a database-backed configuration table and add an admin UI for managing class prices and bundle settings. Gabrielle can change prices without a code deploy.

## Data Model

### New table: `bundleConfig`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `id` | serial | PK | |
| `name` | text | — | Display name, e.g. "6-Class Bundle" |
| `priceInPence` | integer | — | Bundle purchase price |
| `credits` | integer | — | Number of classes included |
| `expiryDays` | integer | — | Days until bundle expires |
| `active` | boolean | true | Only active bundles are purchasable |
| `createdAt` | timestamp | now() | |
| `updatedAt` | timestamp | now() | |

Multi-row table — each row is a distinct bundle product. For the initial release there is one active bundle (the current "6-Class Bundle" at £66). The schema supports multiple bundles from day one.

### Existing table: `classes`

Already has `priceInPence`. No schema changes needed — the admin UI exposes editing this column.

### Existing table: `bundles` (purchases)

Already snapshots `creditsTotal` and `expiresAt` per purchase. Config changes only affect new purchases — existing bundles keep their original terms.

## API Routes

### `GET /api/admin/pricing`

Returns all class prices and active bundle configs:

```json
{
  "classes": [
    { "id": 1, "title": "Prenatal Yoga", "slug": "prenatal", "priceInPence": 1250 }
  ],
  "bundleConfigs": [
    { "id": 1, "name": "6-Class Bundle", "priceInPence": 6600, "credits": 6, "expiryDays": 90, "active": true }
  ]
}
```

### `PUT /api/admin/pricing`

Accepts partial updates to classes and/or bundle configs:

```json
{
  "classes": [
    { "id": 1, "priceInPence": 1400 }
  ],
  "bundleConfigs": [
    { "id": 1, "priceInPence": 7200, "credits": 8 }
  ]
}
```

- Class updates: `db.update(classes).set({ priceInPence }).where(eq(classes.id, id))` per class.
- Bundle config updates: `db.update(bundleConfig).set({ ...fields, updatedAt: new Date() }).where(eq(bundleConfig.id, id))`.
- Both wrapped in a single `db.transaction()` if sent together.
- Validation: `priceInPence` > 0, `credits` > 0, `expiryDays` > 0.

No auth middleware needed — existing proxy protects `/admin/*` routes.

## Replacing Hardcoded Constants

### Server-side (read from DB at request time)

| File | Current | New |
|------|---------|-----|
| `src/app/api/book/checkout/route.ts` | `BUNDLE_PRICE_PENCE = 6600`, `BUNDLE_CREDITS = 6`, hardcoded 90-day description | Receive `bundleConfigId` in request body, load config from DB |
| `src/app/api/stripe/webhook/route.ts` | `expiresAt.setDate(expiresAt.getDate() + 90)` and hardcoded credits | Read `bundleConfigId` from Stripe session metadata, load config from DB |

**Bundle purchase flow:**
1. Bundle page loads active bundle config from DB, displays price/credits/expiry
2. "Buy" button POSTs to `/api/book/checkout` with `type: "bundle"` and `bundleConfigId`
3. Checkout route validates the config exists and is active, creates Stripe session with `bundleConfigId` in metadata
4. Webhook reads `bundleConfigId` from Stripe metadata, loads config for credits and expiry calculation

### Client-side (props from server components)

| File | Current | New |
|------|---------|-----|
| `src/app/book/page.tsx` | N/A (booking-client hardcodes values) | Fetch bundle config, pass as props to BookingClient |
| `src/app/book/booking-client.tsx` | Hardcoded `formatPrice(6600)`, "6-Class Bundle", "Valid 90 days" | Receive `bundleConfig` prop, render dynamically |
| `src/app/book/bundle/page.tsx` | Hardcoded `£66`, "Six Class Bundle", "Valid for 90 days" | Fetch bundle config, render dynamically |

### Left as-is

- `src/app/terms/page.tsx` — Legal text mentioning 90 days. Editorial content that should be updated manually if terms change.
- Test files — Mock their own values; not coupled to the config table.
- DB schema defaults on `bundles` table — Column defaults are just fallbacks; actual values come from the config at purchase time.

## Admin UI

### New page: `/admin/pricing`

"Pricing" added to admin nav between Schedule and Bookings.

**Class Prices section:** Table with columns Class Name and Price. Each price is an inline editable input with `£` prefix. Prices entered in pounds, converted to pence on save.

**Bundle Configuration section:** Card below the class table. Three-column grid: Bundle Price (£), Classes Included (number), Expiry (days). Helper text: "Changes apply to new purchases only."

**Save flow:**
1. User edits values
2. Clicks "Save Changes"
3. Confirmation dialog shows diff of what changed (e.g. "Prenatal Yoga: £12.50 → £14.00")
4. On confirm, PUT to `/api/admin/pricing`
5. Success feedback, data refreshed

Uses existing shadcn components: `Button`, `Input`, `Label`. Matches schedule page styling (dawn-light background, white cards, same borders/shadows).

## Seed Data

New seed script `scripts/seed-bundle-config.ts` inserts the initial bundle config:

```typescript
{ name: "6-Class Bundle", priceInPence: 6600, credits: 6, expiryDays: 90, active: true }
```

Called from `just db-seed` alongside existing seed scripts.

## Testing

- **API tests** (`tests/api/admin-pricing.test.ts`): GET returns classes + bundle configs. PUT updates prices. PUT validates inputs (no negative prices, no zero credits). Transaction rolls back on partial failure.
- **Checkout test updates** (`tests/api/book-checkout.test.ts`): Mock the bundle config DB query instead of relying on constants. Existing test structure preserved.
- **Webhook test updates** (`tests/api/stripe-webhook.test.ts`): Mock bundle config lookup by ID from Stripe metadata.

## Future: Multiple Bundles and Class Restrictions

The current design supports a single active bundle. The path to multiple bundles with class-specific restrictions:

### Phase 1 (this work): Foundation

- `bundleConfig` is already a multi-row table with an `active` flag
- Each purchase in `bundles` already snapshots its terms independently
- Checkout attaches `bundleConfigId` to Stripe metadata

### Phase 2: Multiple active bundles

- Allow multiple rows in `bundleConfig` with `active = true`
- Update booking UI to present bundle options (e.g. dropdown or cards)
- Update bundle purchase page to accept a `bundleConfigId` parameter
- No schema changes needed — just UI and routing updates

### Phase 3: Class-specific bundles

- New junction table `bundleConfigClasses`:

  | Column | Type | Notes |
  |--------|------|-------|
  | `bundleConfigId` | integer | FK → bundleConfig.id |
  | `classId` | integer | FK → classes.id |

- If a bundle config has no rows in `bundleConfigClasses`, it applies to all classes (backwards compatible)
- If it has rows, only those classes are eligible for redemption
- Update redemption logic in `/api/book/redeem` to check eligibility
- Update booking UI to show which bundles apply to the selected class
- Admin UI gets a multi-select for assigning classes to each bundle

### Phase 4: Bundle management admin

- Full CRUD for bundle configs in admin (create new bundles, deactivate old ones)
- Naming, description fields for customer-facing display
- Price-per-class calculation shown in admin for quick comparison

This progression requires no breaking schema changes at any phase — each step adds to what exists.

## Out of Scope

- Multiple active bundles (Phase 2 above)
- Class-specific bundle restrictions (Phase 3 above)
- Bundle management CRUD in admin (Phase 4 above)
- Discount codes or promotional pricing
- Stripe price objects (we use Checkout line items with dynamic amounts)
- Subscription/recurring billing

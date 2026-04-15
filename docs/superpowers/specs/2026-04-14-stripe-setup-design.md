# Stripe Account Setup & Price Update

## Summary

Connect Moontide to a live Stripe account and update class/bundle pricing to confirmed values. The Stripe integration code (checkout, webhooks, redemption) is already fully built and tested — this work is price corrections plus ops setup.

## Code Changes

### 1. Update bundle price (7500 → 6600 pence)

Three locations:

| File | Line | Current | New |
|------|------|---------|-----|
| `src/app/api/book/checkout/route.ts` | 7 | `BUNDLE_PRICE_PENCE = 7500` | `BUNDLE_PRICE_PENCE = 6600` |
| `src/app/book/booking-client.tsx` | 353 | `formatPrice(7500)` | `formatPrice(6600)` |
| `src/app/book/bundle/page.tsx` | 56 | `£75` | `£66` |

Remove the "Gabrielle to confirm" comment from the checkout route constant.

### 2. Update seed class prices (1500 → 1250 pence)

| File | Lines | Current | New |
|------|-------|---------|-----|
| `scripts/seed-classes.ts` | 16, 23, 30, 37 | `priceInPence: 1500` | `priceInPence: 1250` |

Seed data only — production class prices are already in the database and will need a migration or manual update via Drizzle Studio.

### 3. Update AGENTS.md

Change the pricing reference from "£75 / 7500 pence for 6 classes" to "£66 / 6600 pence for 6 classes".

### 4. Add Stripe CLI webhook forwarding to Justfile

```just
stripe-listen:
    stripe listen --forward-to localhost:3000/api/stripe/webhook
```

### 5. Update test fixtures

`tests/api/book-checkout.test.ts` references `priceInPence: 1200` in mock data — leave as-is (test fixtures don't need to match real prices, they test the flow).

## Ops Runbook (manual steps)

### Phase 1: Account creation

1. Go to https://dashboard.stripe.com/register
2. Register under Gabrielle's business details
3. Complete identity verification (Stripe will request this before live payments)

### Phase 2: Test mode setup

1. In the Stripe Dashboard, ensure you're in **Test mode** (toggle top-right)
2. Go to Developers → API keys
3. Copy the **Secret key** (starts with `sk_test_`)
4. Copy the **Publishable key** (starts with `pk_test_`) — not currently used but good to have
5. Add to Doppler `dev` config:
   - `STRIPE_SECRET_KEY` = sk_test_...
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` = pk_test_...
6. Install Stripe CLI: `brew install stripe/stripe-cli/stripe` (or via mise)
7. Run `stripe login` to authenticate
8. Run `just stripe-listen` — copy the webhook signing secret it prints
9. Add to Doppler `dev` config:
   - `STRIPE_WEBHOOK_SECRET` = whsec_...

### Phase 3: Local end-to-end test

1. `just dev` (starts server with Doppler secrets injected)
2. `just stripe-listen` (in a second terminal)
3. Navigate to `/book`, pick a class, enter test details
4. Use test card `4242 4242 4242 4242` (any future expiry, any CVC)
5. Verify:
   - Redirect to confirmation page
   - Booking appears in `/admin/bookings`
   - Stripe Dashboard shows the payment
6. Test bundle purchase at `/book/bundle` — same flow
7. Test bundle redemption: go back to `/book`, select a class, choose "Use bundle"
8. Verify credit decremented in `/admin/bundles`

### Phase 4: Production setup

1. Switch Stripe Dashboard to **Live mode**
2. Copy live API keys (sk_live_..., pk_live_...)
3. Add to Doppler `prd` config (Doppler-Vercel integration auto-syncs to Vercel Production)
4. In Stripe Dashboard → Developers → Webhooks → Add endpoint:
   - URL: `https://<production-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`
5. Copy the webhook signing secret → add to Doppler `prd` as `STRIPE_WEBHOOK_SECRET`
6. Repeat for Doppler `stg` config with the same live keys (or separate test keys for staging)
7. Make a real £12.50 test purchase, then refund it in the Stripe Dashboard

### Phase 5: Production class price update

The seed script sets class prices, but production data is already seeded at £15. To update:

1. Run `just db-studio` (opens Drizzle Studio)
2. Update `priceInPence` to `1250` for all class types
3. Or run a one-off SQL: `UPDATE classes SET price_in_pence = 1250;`

## Out of scope

- Moving bundle price/credits/expiry to a DB table (separate backlog item: "Price management admin")
- Stripe Elements or client-side card capture (server-side Checkout is the current architecture)
- Stripe Connect or marketplace payouts
- Subscription/recurring billing

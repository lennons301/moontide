# Moontide

Wellbeing website for women navigating change through yoga, coaching, and embodied connection.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.7
- **Database:** Neon (Postgres) with Drizzle ORM
- **CMS:** Sanity (project ID: 77icfczp, dataset: production)
- **Auth:** Better Auth (admin-only, email/password)
- **Payments:** Stripe Checkout + webhooks
- **UI:** shadcn/ui + Tailwind CSS v4
- **Email:** Resend
- **Linting:** Biome (pre-commit via husky + lint-staged)
- **Secrets:** Doppler (project: moontide, configs: dev/stg/prd)
- **Dev Environment:** mise + just
- **Deployment:** Vercel Hobby
- **Testing:** Vitest

## Commands

```bash
just dev              # Start dev server (Docker + Doppler + pnpm)
just test             # Run tests
just lint             # Lint and format (Biome)
just typecheck        # Type check (tsc --noEmit)
just build            # Production build
just setup            # First-time setup
just db-migrate       # Apply database migrations
just db-generate      # Generate database migrations
just db-seed          # Seed local database
just db-seed-cms      # Seed Sanity CMS content
just db-studio        # Open Drizzle Studio
```

## Project Structure

```
src/
  app/                    # Next.js App Router pages
    api/
      auth/[...all]/      # Better Auth API handler
      contact/            # Contact form POST endpoint
      stripe/webhook/     # Stripe webhook (checkout.session.completed)
      book/
        checkout/         # Create Stripe Checkout session (individual + bundle)
        redeem/           # Redeem bundle credit for booking
      admin/
        schedules/        # CRUD API for class schedules
        classes/          # GET active class types
        pricing/          # GET/PUT class prices and bundle config
        bookings/         # GET all bookings
        bundles/          # GET all bundles
        messages/         # GET contact submissions
      revalidate/           # Sanity webhook for on-demand ISR revalidation
    admin/
      login/              # Admin login page
      schedule/           # Schedule management (CRUD)
      pricing/            # Manage class prices and bundle config
      bookings/           # View bookings
      bundles/            # View bundles
      messages/           # Contact message inbox
    book/
      bundle/             # Bundle purchase page
      confirmation/       # Post-payment confirmation
    studio/[[...tool]]/   # Embedded Sanity Studio at /studio
    classes/[slug]/       # Dynamic class detail pages
  components/
    ui/                   # shadcn/ui components (button, input, textarea, label, sheet)
    nav.tsx               # Header: burger left, logo right
    mobile-menu.tsx       # Full-screen menu with collapsible Classes section
    footer.tsx            # Site footer with service links
    hero.tsx              # Homepage hero section
    booking-options.tsx   # Individual class + bundle booking grid
    services-section.tsx  # Grouped services: 2x2 class grid, featured cards, community
    about-preview.tsx     # Homepage about Gabrielle preview
    contact-form.tsx      # Contact form with shadcn/ui inputs
  lib/
    auth.ts               # Better Auth server config
    auth-client.ts        # Better Auth client config
    stripe.ts             # Stripe client singleton
    db/
      index.ts            # Drizzle client (postgres.js driver)
      schema.ts           # Drizzle schema (all tables including bundleConfig + re-exports auth-schema)
      auth-schema.ts      # Better Auth tables (user, session, account, verification)
    sanity/
      client.ts           # Sanity client + urlFor() image helper
      queries.ts          # GROQ queries for all document types
      types.ts            # TypeScript types for Sanity documents
    email.ts              # Resend email helper (sendContactEmail)
  sanity/
    schema/               # Sanity document schemas (siteSettings, service, page, trainer, communityEvent)
    structure.ts          # Sanity Studio desk structure
  proxy.ts                  # Admin route protection (/admin/* except /admin/login)
scripts/
  seed-sanity.ts          # CMS seed script
  seed-classes.ts         # Seed class types (prenatal, postnatal, baby-yoga, vinyasa)
  seed-admin.ts           # Seed admin user (Gabrielle)
tests/
  api/contact.test.ts     # Contact form API tests
  api/stripe-webhook.test.ts  # Stripe webhook handler tests
  api/book-checkout.test.ts   # Checkout session tests
  api/book-redeem.test.ts     # Bundle redemption tests
  admin/schedules.test.ts     # Admin schedule API tests
  api/admin-pricing.test.ts   # Admin pricing API tests
  lib/email.test.ts       # Email helper tests
drizzle/
  migrations/             # Generated Drizzle migrations
```

## Key Conventions

- **Package manager:** pnpm (not npm). Use `pnpm add`, `pnpm exec`, `pnpm dlx`.
- **Secrets:** Managed via Doppler — never commit .env files. Use `doppler run --` to inject.
- **CMS boundary:** Editorial content (text, images, descriptions) → Sanity. Transactional data (bookings, contact submissions) → Neon Postgres.
- **Tailwind CSS v4:** No tailwind.config.ts. Colours configured via `@theme inline` in globals.css. Custom palette: deep-tide-blue (#1e3a5f), deep-ocean (#2c3e50), ocean-light-blue (#5fa8d3), bright-orange (#ff7a2f), soft-moonstone (#e7e3dc), dawn-light (#f7f9fb), seagrass (#6b8f71), sky-mist (#dceaf4).
- **Design:** Mobile-first, photography-led, light and inviting. Theme: "Calm, luminous and gently energising — like light moving across water."
- **Nav layout:** Burger menu left, logo (MOONTIDE) right.
- **Services grouping:** Classes shown as 2x2 photo grid, coaching/private as featured cards, community as light text block.
- **Sanity images:** Use `urlFor(image).width(x).height(y).url()` from `@/lib/sanity/client`.
- **Page fallbacks:** All content pages try Sanity first, fall back to hardcoded content if CMS returns null.
- **Local dev:** Docker Compose for Postgres, mise for tool versions, just for commands, Doppler for secrets.
- **Postgres driver:** Use `postgres` (postgres.js), not `@neondatabase/serverless` — must work with local Docker.
- **Revalidation:** Homepage uses `revalidate = 60` for ISR. Content pages are static with Sanity fallbacks.
- **Linting:** Biome runs on pre-commit via husky. Run `just lint` to check/fix manually.
- **Auth:** Better Auth protects `/admin/*` routes via proxy. Login at `/admin/login`.
- **Admin APIs:** Routes at `/api/admin/*` — not separately auth-protected (rely on proxy for page access).
- **Stripe webhook:** At `/api/stripe/webhook` — reads raw body for signature verification, never parse JSON before verifying.
- **Booking flow:** `/api/book/checkout` (Stripe Checkout) and `/api/book/redeem` (bundle credit). Checkout handles both individual and bundle purchases via `type` field.
- **Prices in pence:** Class prices stored in `classes.priceInPence`. Bundle config (price, credits, expiry) stored in `bundleConfig` table — editable via admin UI at `/admin/pricing`.
- **Bundle config:** The `bundleConfig` table holds bundle products (price, credits, expiry days). Checkout attaches `bundleConfigId` to Stripe session metadata; webhook reads it back to set credits and expiry on the purchased bundle. Changes only affect new purchases.
- **Bundle redemption:** Email-based lookup, no customer auth required. Expiry set per-bundle from config at purchase time.
- **DB transactions:** Multi-step mutations (e.g., booking insert + count increment) wrapped in `db.transaction()` for atomicity.
- **CI/CD:** GitHub Actions runs lint, typecheck, and test on PRs and pushes to master. No secrets needed in CI — all tests use mocks.
- **Secrets sync:** Doppler-Vercel integration auto-syncs secrets. Doppler `prd` → Vercel Production, Doppler `stg` → Vercel Preview. Never manually set env vars in Vercel that Doppler manages.
- **CMS revalidation:** Sanity webhook POSTs to `/api/revalidate` on publish. Handler verifies `SANITY_WEBHOOK_SECRET` header, maps document types to paths, calls `revalidatePath()`. All CMS pages also have `revalidate = 3600` as a fallback.

## Environments

| Environment | Database | Secrets | URL |
|-------------|----------|---------|-----|
| dev | Local Docker Postgres | Doppler dev | localhost:3000 |
| stg | Neon staging branch | Doppler stg | Vercel preview |
| prd | Neon production | Doppler prd | gabriellemoontide.co.uk |

## Platform Context

Platform standards and choices: see ~/code/platform/
This project's registry entry: products/moontide.yaml

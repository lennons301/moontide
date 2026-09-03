# Moontide

Wellbeing website for women navigating change through yoga, coaching, and embodied connection.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.7
- **Database:** Neon (Postgres) with Drizzle ORM
- **CMS:** Sanity (project ID: 77icfczp, dataset: production)
- **Auth:** Better Auth (admin-only, email/password)
- **Validation:** Zod 4 (request schemas for `/api/admin/*`)
- **Payments:** Stripe Checkout + webhooks
- **UI:** shadcn/ui + Tailwind CSS v4
- **Email:** Resend
- **Linting:** Biome (pre-commit via husky + lint-staged)
- **Secrets:** Doppler (project: moontide, configs: dev/stg/prd)
- **Dev Environment:** mise + just
- **Deployment:** Vercel Hobby
- **Testing:** Vitest (three projects: mocked node + jsdom unit tests, and integration tests against a real Postgres)

## Commands

```bash
just dev              # Start dev server (Docker + Doppler + pnpm)
just test             # Run tests (mocked + integration; starts the local Postgres)
just test-unit        # Run only the mocked tests (no database, no Docker)
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
        checkout/         # Create Stripe Checkout session (individual + bundle, or an offered held seat)
        redeem/           # Redeem bundle credit (new seat or an offered held seat)
      admin/
        _lib/             # withAdmin: session + role, body/query parsing, one error shape
        resend-email/     # POST resend a booking or bundle confirmation
        schedules/        # CRUD API for class schedules
        waitlist/         # GET waiting list + occupancy, DELETE an entry
        waitlist/offer/   # POST offer a held seat, DELETE withdraw it
        classes/          # GET active class types
        pricing/          # GET/PUT class prices and bundle config
        bookings/         # GET all bookings
        bundles/          # GET all bundles
        messages/         # GET contact submissions
      cron/
        retry-emails/     # Cron (daily): retry unsent confirmation emails, then the daily offer work
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
    admin/                # Shared chrome for the admin tables
      use-table-controls.ts   # Search + sort + filter state, and deriveTableRows
      admin-table-toolbar.tsx # Search box, filter slot, "showing n of m"
      table-headers.tsx       # SortableHead + SortHeader/PlainHeader (sort state by context)
      table-filters.ts        # The status/class/upcoming-or-past filter set
      pill-group.tsx          # Single-choice filter pills
      status-badge.tsx        # Every admin status colour, in one map
      format-date.ts          # The four date shapes the admin uses, plus todayString
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
    admin/
      pricing-changes.ts  # The pricing page diff: confirm summary + PUT payload
    stripe.ts             # Stripe client singleton
    bookings/
      transitions.ts      # Pure cancel/release/reschedule decisions (no DB)
    bundles/
      credits.ts          # Sole owner of bundles.creditsRemaining writes, and the read that picks the bundle
      purchase.ts         # The terms a bundle was sold on: the session's metadata keys, and expiry from when she paid
    db/
      index.ts            # Drizzle client (postgres.js driver)
      schema.ts           # Drizzle schema (all tables including bundleConfig + re-exports auth-schema)
      auth-schema.ts      # Better Auth tables (user, session, account, verification)
    content/             # Every CMS read, and every fallback for one
      source.ts           # The ContentSource seam: the Sanity adapter, and fetchOrNull
      in-memory-source.ts # The other adapter: a CMS held in a variable, for tests
      fallbacks.ts        # One copy of every piece of hardcoded content
      services.ts         # getService(slug) / getServices()
      trainer.ts          # getTrainer() — the one trainer fallback, shared by / and /about
      community.ts        # getCommunityEvents()
      site-settings.ts    # getSiteSettings() — hero tagline, Instagram link
      homepage.ts         # The homepage's three sections, composed from the above
    sanity/
      client.ts           # Sanity client + urlFor() image helper
      queries.ts          # GROQ queries — imported only by src/lib/content/
      types.ts            # TypeScript types for Sanity documents
    email.ts              # Resend email helper (sendContactEmail)
    schedule-occupancy.ts # Sole owner of schedules.bookedCount writes
    time/london.ts        # Europe/London wall-clock composition for schedules
    waitlist/
      offers.ts           # Pure decisions: deadlines, offer capacity, redemption seat
      held-seats.ts       # The reads those decisions need
      cancellation.ts     # What cancelling a class does to its outstanding offers
      settlement.ts       # One path for giving a held seat back (withdrawal + expiry)
      digest.ts           # Pure decisions: what belongs in Gabrielle's daily digest
      daily.ts            # The daily job: settle expired offers, send the digest
  sanity/
    schema/               # Sanity document schemas (siteSettings, service, page, trainer, communityEvent)
    structure.ts          # Sanity Studio desk structure
  proxy.ts                  # Admin route protection (/admin/* except /admin/login)
scripts/
  seed-sanity.ts          # CMS seed script
  seed-classes.ts         # Seed class types (prenatal, postnatal, baby-yoga, vinyasa)
  seed-admin.ts           # Seed admin user (Gabrielle)
  ci/
    run-sql.mjs           # Run a .sql file against DATABASE_URL (no psql, no tsx)
    forget-new-migrations.mjs # Make this branch's migrations look unapplied, to replay them
    explain-migration-failure.mjs # Name the statement drizzle-kit died on (it says nothing)
tests/
  setup-dom.ts            # jsdom setup: jest-dom matchers, cleanup between tests
  support/admin-session.ts # The fake admin session the admin route tests run behind
  admin/with-admin.test.ts # The request module: auth, parsing, error shape
  admin/routes-are-protected.test.ts # Every /api/admin handler, signed out and demoted
  admin/bookings.test.ts      # Booking list + cancel/release/reschedule wiring
  admin/bundles.test.ts       # Bundle list
  admin/classes.test.ts       # Active class list
  admin/messages.test.ts      # Contact message read flag
  admin/resend-email.test.ts  # Resending a booking or bundle confirmation
  admin/validation-messages.test.ts # No admin refusal is phrased by zod
  components/admin/*.test.tsx # Rendered admin chrome (PillGroup, headers, badge)
  components/admin/use-table-controls.test.ts # deriveTableRows / toggleSortState
  components/admin/format-date.test.ts # The four date shapes, and todayString
  components/admin/table-filters.test.ts # Status/class/time filter composition
  lib/admin-pricing-changes.test.ts # Pricing diff: summary and payload agree
  api/contact.test.ts     # Contact form API tests
  api/stripe-webhook.test.ts  # Stripe webhook handler tests
  api/book-checkout.test.ts   # Checkout session tests
  api/book-redeem.test.ts     # Bundle redemption tests
  admin/schedules.test.ts     # Admin schedule API tests
  api/admin-pricing.test.ts   # Admin pricing API tests
  lib/email.test.ts       # Email helper tests
  lib/bundle-purchase.test.ts # Terms fixed at purchase: session over config, expiry from payment
  lib/booking-transitions.test.ts  # Cancel/release/reschedule decision tests
  lib/schedule-occupancy.test.ts  # Seat claim/release semantics
  lib/waitlist-offers.test.ts # Seat offer decision rules
  lib/waitlist-cancellation.test.ts # Voiding offers when a class is cancelled
  lib/waitlist-digest.test.ts # Which entries go in which digest section
  api/cron-offer-sweep.test.ts # Expiry settlement + digest through the daily route
  lib/london-time.test.ts     # Class starts across the BST boundary
  admin/waitlist.test.ts      # Waiting list API tests
  admin/waitlist-offer.test.ts # Offer/withdraw route wiring
  support/content.ts      # What the CMS holds for one test, or that it is unreachable
  support/sanity-client.ts # The client module stubbed: reading it directly fails
  lib/content.test.ts     # Every content question, with the CMS up and with it down
  lib/content-source.test.ts # The seam: fetchOrNull, and the in-memory adapter
  lib/cms-reads-go-through-content.test.ts # Nothing outside src/lib/content reads Sanity
  lib/homepage-content.test.ts # Homepage CMS fallbacks, section by section
  app/homepage.test.ts    # Homepage renders with the CMS up and with it down
  app/content-pages.test.ts # /about, /coaching, /private, /community, /classes/[slug]
  app/layout.test.ts      # Root layout renders every page when Sanity throws
  integration/            # Runs against a real Postgres, not mocks
    support/database-url.ts # Which server, and the throwaway database on it
    support/global-setup.ts # Drop, create and migrate that database, once per run
    support/setup.ts        # Empty every table before each test
    support/factories.ts    # Rows to test against
    schedule-occupancy.test.ts # Real occupancy numbers, clamps and a seat race
    booking-constraints.test.ts # The unique indexes, refusing duplicates
    bundle-constraints.test.ts # One bundle per payment, the config it came from, the credit range
    capacity-constraints.test.ts # The CHECK refusing occupancy over capacity
    bundle-credits.test.ts  # Real balances, the clamps and a race for one credit
    admin-bookings-cancel.test.ts # A route end to end: request in, rows out
    book-redeem.test.ts     # Redemption end to end: which bundle, and two racing for one credit
    schedule-delete.test.ts # Deleting a class: what goes with it, what survives
drizzle/
  migrations/             # Generated Drizzle migrations
  ci/seed.sql             # Production-shaped data the CI migration check runs against
```

## Key Conventions

- **Package manager:** pnpm (not npm). Use `pnpm add`, `pnpm exec`, `pnpm dlx`. The version is pinned in two places that must agree: `packageManager` in `package.json` (what corepack, Vercel and the agent containers read) and `pnpm` in `.mise.toml` (what CI reads, via `jdx/mise-action`). Change both or environments diverge again.
- **`pnpm-workspace.yaml` is intentional — do not delete it as a stray file.** There is no workspace here; the file exists for its `allowBuilds` map, which is how pnpm ≥ 10.26 is told which dependencies may run install scripts (`esbuild` and `sharp` yes, they place native binaries; `msw` no). Left undecided, pnpm writes the same file back full of `set this to true or false` placeholders — which is what four separate PRs mistook for a stray file and reverted. A `pnpm-workspace.yaml` in a diff is only wrong if it contains those placeholders; then decide the new entry rather than deleting the file. The pinned pnpm is why the prompt is now the same everywhere.
- **Secrets:** Managed via Doppler — never commit .env files. Use `doppler run --` to inject.
- **CMS boundary:** Editorial content (text, images, descriptions) → Sanity. Transactional data (bookings, contact submissions) → Neon Postgres.
- **Tailwind CSS v4:** No tailwind.config.ts. Colours configured via `@theme inline` in globals.css. Custom palette: deep-tide-blue (#1e3a5f), deep-ocean (#2c3e50), ocean-light-blue (#5fa8d3), bright-orange (#ff7a2f), soft-moonstone (#e7e3dc), dawn-light (#f7f9fb), seagrass (#6b8f71), sky-mist (#dceaf4).
- **Design:** Mobile-first, photography-led, light and inviting. Theme: "Calm, luminous and gently energising — like light moving across water."
- **Nav layout:** Burger menu left, logo (MOONTIDE) right.
- **Services grouping:** Classes shown as 2x2 photo grid, coaching/private as featured cards, community as light text block.
- **Sanity images:** Use `urlFor(image).width(x).height(y).url()` from `@/lib/sanity/client`.
- **Page fallbacks:** No page reads the CMS. `src/lib/content/` answers **content questions** — `getService(slug)`, `getServices()`, `getTrainer()`, `getCommunityEvents()`, `getSiteSettings()` — and the fallback is part of the answer, so a page renders one thing rather than choosing between a document and a local backup it remembered to write. Every read goes through `fetchOrNull` (`src/lib/content/source.ts`), where a throw becomes "the CMS has nothing to say", which is the state every question already has content for: a Sanity outage costs the CMS's version of a page, never the page. Questions are asked one at a time, so one failing query degrades one section (the homepage's hero, services grid and about preview go independently). The **root layout** is the reason this matters beyond the CMS pages: it wraps every route, including `/book`, which is pure Postgres, so an uncaught throw there once took the whole site down over an optional Instagram link. Consequences:
  - **The trainer has one fallback.** `/` reads the name, short bio and photo, `/about` the bio and qualifications; they used to fetch the same document with two unrelated sets of hardcoded content and no way to notice they disagreed. Likewise each service's fallback copy is in `src/lib/content/fallbacks.ts`, not in the page that renders it. (The hardcoded *class catalogue* — which classes exist — is a separate concern and still spread across `src/` and `scripts/`; see #38.)
  - **`src/lib/sanity/queries.ts` is imported only by `src/lib/content/`**, and `sanityClient.fetch` is called only from the Sanity adapter. `tests/lib/cms-reads-go-through-content.test.ts` sweeps `src/**` for both, discovering the files rather than listing them, so a new page is held to it the moment it exists.
  - **Tests answer with documents, not query strings.** `ContentSource` has two implementations: Sanity, and the in-memory one in `src/lib/content/in-memory-source.ts` that a test hands documents to (`givenCmsHolds`/`givenCmsUnreachable` in `tests/support/content.ts`, with `afterEach(resetContentSource)`). An `Error` in place of a document is that one read failing. Page tests also stub `@/lib/sanity/client` (`tests/support/sanity-client.ts`) — it builds a real client on import, and its `fetch` throws so a test that skipped installing a source fails loudly instead of reaching for the network.
- **Local dev:** Docker Compose for Postgres, mise for tool versions, just for commands, Doppler for secrets.
- **Postgres driver:** Use `postgres` (postgres.js), not `@neondatabase/serverless` — must work with local Docker.
- **Revalidation:** Homepage uses `revalidate = 60` for ISR. Content pages are static with Sanity fallbacks.
- **Linting:** Biome runs on pre-commit via husky. Run `just lint` to check/fix manually.
- **Test environments:** the mocked suite is split by file extension — `tests/**/*.test.ts` runs in the `unit` project (node), `tests/**/*.test.tsx` runs in the `dom` project (jsdom, with `@testing-library/react` and `tests/setup-dom.ts`). The split is by extension, not directory, so a folder can hold both. Both are pinned to `TZ=UTC`: the admin date helpers format in the runtime timezone, so their expectations only hold on a machine that happens to be on UTC.
- **Admin table chrome:** `src/components/admin/` holds one definition each of the pieces every admin table needs — the toolbar, the header row, the filter pills, the status badge and the date formats. Add to it rather than copying into a page. `SortableHead` carries the sort state from `useTableControls` by context, so a sortable column is declared as `<SortHeader label="Date" sortKey="date" />` and never wires `activeKey`/`direction`/`onClick`. Dates have four deliberate shapes (`formatDate`, `formatDateWithWeekday`, `formatDateTime`, `formatDeadline`); a fifth wants a fifth question, not a fifth option bag.
- **Logic in `"use client"` pages:** a page component cannot be imported by a node test, so anything with branches goes into a module the page then wires up — `buildAdminTableFilters`, `buildChangeSummary`/`buildPricingPayload` (`src/lib/admin/pricing-changes.ts`), `selectRescheduleTargets` (`src/lib/bookings/transitions.ts`, beside the server rules it mirrors). `deriveTableRows` is the pattern.
- **Auth:** Better Auth protects `/admin/*` routes via proxy. Login at `/admin/login`. There is one account — Gabrielle's — and no customer auth at all: bookings are keyed by email address. So **sign-up is disabled** (`disableSignUp` on the mounted instance, and `/api/auth/sign-up*` is refused at the proxy, which is why the matcher covers `/api/auth/:path*`). Accounts are created only by `scripts/seed-admin.ts`, which builds its own `createAuth({ allowSignUp: true })` instance in-process.
- **The admin role:** `user.role` must be `"admin"` to get past the proxy. It is declared to Better Auth as an additional field with `input: false`, so no auth endpoint can set it — the seed script grants it with a direct `UPDATE`. Migration `0012` backfills every user that predates it, because they are all admin logins.
- **Proxy session check:** `src/proxy.ts` resolves the cookie through `auth.api.getSession` rather than testing that a cookie exists — a cookie is a string a visitor can type. No session, a forged or expired token, a non-admin user, or a session lookup that throws are all refused (401 for `/api/admin/*`, redirect to login for pages). The proxy runs on the Node runtime, so it can reach the database directly. Tests: `tests/proxy.test.ts`.
- **Admin APIs:** Every handler under `/api/admin/*` is `withAdmin(schema, handler)` from `src/app/api/admin/_lib`, and nothing else. It resolves the session through `auth.api.getSession` and insists on the admin role (401 with no session, a forged one or a lookup that throws; 403 for a real session on a non-admin), parses `schema.body` and `schema.query` with zod, and renders every failure as `{ error }` through the one `jsonError`. So a handler receives `{ body, query, user, request }` — parsed values, never a `Request` to pick apart — and never validates, never reads `request.json()`, never constructs an error response. **Every validation message is written into the schema** (`z.number({ error: "Missing schedule ID" })`), because the response says exactly what the schema said; repeated messages are collapsed, so three fields sharing "Missing required fields" answer with it once. A refusal is **thrown** as `ApiError(status, message)` — including from inside `db.transaction`, where the throw is also the rollback — and `refuse(decision)` is the shorthand for the `{ ok: false, error, httpStatus }` the pure decision functions return. Anything else thrown is a fault: logged, and answered `500 { error: "Something went wrong" }`. Checking auth here as well as at the proxy is deliberate: the proxy is a matcher, and a handler that refuses on its own does not depend on being routed through anything. Tests: `tests/admin/with-admin.test.ts` for the module, `tests/admin/routes-are-protected.test.ts` for the sweep — it **discovers** the routes with `import.meta.glob("/src/app/api/admin/**/route.ts")` rather than listing them, so a new route directory is swept the moment it exists and a handler that forgets the module fails. `tests/admin/validation-messages.test.ts` holds the convention up: it feeds every admin schema the awkward bodies and asserts the answer is never one of zod's own phrasings, because the admin pages put `data.error` straight into a `window.alert`.
- **Stripe webhook:** At `/api/stripe/webhook` — reads raw body for signature verification, never parse JSON before verifying.
- **Booking flow:** `/api/book/checkout` (Stripe Checkout) and `/api/book/redeem` (bundle credit). Checkout handles both individual and bundle purchases via `type` field, and an offered held seat via `offerToken`.
- **Prices in pence:** Class prices stored in `classes.priceInPence`. Bundle config (price, credits, expiry) stored in `bundleConfig` table — editable via admin UI at `/admin/pricing`.
- **Bundle config:** The `bundleConfig` table holds bundle products (price, credits, expiry days). Changes only affect new purchases, and that is enforced rather than assumed: **the terms are fixed at purchase time.** Checkout writes `bundleName`, `bundleCredits` and `bundleExpiryDays` into the Stripe session metadata alongside `bundleConfigId`, in the same read that sets the price charged (`bundleTermsMetadata` in `src/lib/bundles/purchase.ts` owns those keys, and the webhook reads them back through `decideBundleTerms` — one definition, both sides). The webhook grants what the session says; the config row is re-read only for the foreign key and as the fallback for a session created before the terms travelled with it. Expiry is counted from `session.created` (`bundlePaidAt` + `bundleExpiry`), not from when the webhook ran, so a delayed or retried delivery cannot quietly extend the validity window. The webhook also **records which config was bought** on `bundles.bundleConfigId`, a real FK, so a later read names the right product: the resend route used to join on `creditsTotal = credits`, which picks the wrong config the moment two of them sell the same number of classes. Nullable, because bundles bought before the column existed can only have it inferred from their credit count. Migration `0013` adds the column and backfills the old rows with exactly that credit-count guess, once. `/api/cron/retry-emails` still joins on credits and should be moved onto the column too.
- **A bundle whose product has gone:** A paid session naming a `bundleConfig` row that is not there (deleted, or a `bundleConfigId` that parses to nothing) used to answer 500, which Stripe redelivers with backoff for about three days — every retry taking the identical branch, and nobody told. It is now answered 200, because the condition is permanent and a retry loop recovers nothing, and the purchase is granted anyway from the terms the session carries, with `bundles.bundleConfigId` left null. Either way Gabrielle gets an email (`sendBundleConfigMissingAlert`): the granted case tells her the customer is fine but the bundle has no product behind it (so admin resend, which joins on the config, will not work for it); the ungranted case — a session too old to carry terms — names the customer and session id and says outright that she has been charged and has nothing.
- **One bundle per payment:** `bundles.stripePaymentId` is unique (migration `0015`, which reconciles any duplicate that predates it by appending `#duplicate-<row id>` to the later rows' payment ids — they are payment records, and credits may already have been spent against them, so they are marked for a human rather than deleted), and the webhook's bundle insert is guarded with `onConflictDoNothing` and returns early when it wrote nothing. A redelivered `checkout.session.completed` is then a no-op rather than a second bundle of free credits and a second confirmation email — the individual branch has always had a guard of its own, and this is the bundle branch's. The constraint is the part that holds under two deliveries at once; the guard is what keeps a redelivery from becoming a 500 Stripe would retry forever.
- **Bundle redemption:** Email-based lookup, no customer auth required. Expiry set per-bundle from config at purchase time. Refuses cancelled classes (read of `schedules.status`) and full classes (via `claimSeat`, so the capacity check is never a read taken beforehand). Capacity is enforced by `claimSeat`, and backstopped by the `schedules_booked_count_within_capacity` CHECK. The credit is spent through `spendCredit` inside the same transaction — see **Bundle credits**.
- **Schedule occupancy:** `src/lib/schedule-occupancy.ts` owns every write to `schedules.bookedCount` — routes never adjust it directly. `claimSeat` is a guarded, atomic claim (the capacity check is the UPDATE's WHERE clause) that returns `{ claimed: false }` rather than throwing; `forceClaimSeat` always takes the seat for already-paid paths — a guarded claim first, and when the class is full a second write that takes the seat and raises `capacity` with it (`GREATEST`, so a seat freed in between can never pull capacity down), reporting `{ capacityRaised }`; `releaseSeat` frees a seat clamped at zero, and `releaseSeats` frees several in one clamped statement so a batch release cannot be half applied.
- **Bundle eligibility:** `classes.bundleEligible` (default true) controls whether bundle credits may be spent on a class. Toggled at `/admin/pricing`; enforced server-side in `/api/book/redeem`, with `/book` hiding the bundle option for ineligible classes.
- **Releasing a seat:** `PUT /api/admin/bookings` with `status: "released"` frees the seat without settling what the customer is owed. Bundle-funded bookings are cancelled and the credit returned (capped at the bundle total, reactivating an exhausted bundle) — the customer re-books themselves. Card-funded bookings move to the `released` status with `releasedAt` set; nothing is refunded in Stripe (as with cancellation) and they appear in the "Owed a class" list on `/admin/bookings` until rescheduled. Rescheduling a released booking increments the target schedule only (its seat was already returned) and returns it to `confirmed`, clearing `releasedAt`. A released booking still counts as active for the one-booking-per-customer-per-schedule index, so the customer cannot re-book that same schedule themselves — intended, and stated in the admin copy.
- **Seat offers:** Gabrielle can hold a free seat for one named person on a class's waiting list. Making an offer inserts a booking with status `held` and takes the seat through `claimSeat`, so the class reads as full to the public through the mechanism it always used — no new visibility rules and no reliance on the manually-set `full` flag. Because each offer takes a seat, offers can never outnumber free seats. Offer state (`offeredAt`, `offerExpiresAt`, `offerToken`, `heldBookingId`) lives on the waiting-list entry, so acceptance removes it and a confirmed booking carries no offer residue; re-offering the same person overwrites it, and no offer history is kept. Withdrawing deletes the held booking, frees the seat and leaves the person on the list — nothing is sent to them. Removing someone who holds an outstanding offer is refused: withdraw first, so the system never infers which was meant.
- **Offer deadlines:** Always the earlier of Gabrielle's choice (24h, 48h, or until the class) and the class start. The class start is composed as a **Europe/London** wall clock via `londonWallClockToUtc` — a schedule stores date and time with no timezone, and composing them naively in a UTC runtime is an hour out through BST.
- **Taking up an offer:** The link carries a 32-byte URL-safe token; possession of it is the sole authorisation, matching the posture that bundle redemption is authorised by email address alone. `/book/offer/[token]` shows the class, the deadline and whether that email holds usable credits, and spends one through `/api/book/redeem`. Redemption converts the held booking in place (occupancy must not move — the offer already counted the seat), removes the waiting-list entry and sends the existing booking confirmation. The duplicate-booking check is bypassed only for the one booking a valid, unexpired token is bound to, for that customer and class; every other active booking still blocks. Rules live in `src/lib/waitlist/offers.ts`.
- **Cancelling a class voids its offers:** `PUT /api/admin/schedules` with `status: "cancelled"` cancels every `held` booking on that schedule and returns those seats, in the same transaction as the status change (`voidOffersOnCancellation` in `src/lib/waitlist/cancellation.ts`), handled ahead of the recurrence branch so the void can never be skipped. Cancellation is never blocked or gated by outstanding offers — Gabrielle cancels at short notice, so this is a consequence of cancelling, not a step to remember — and a class with no offers on it behaves exactly as before (the held-booking write is guarded on `status = 'held'`, so it matches nothing and no occupancy write is made). The waiting-list entry is deliberately left intact, offer token included: the person stays on the list as they do after a withdrawal, and the still-resolving token is what lets `/book/offer/[token]` say the class was cancelled rather than imply someone else took the place. That page checks the schedule status ahead of the offer's own state and presents no way to pay; both payment paths refuse a cancelled class independently.
- **Paying by card for a held seat:** `/book/offer/[token]` offers a card payment too — the only route for a recipient with no usable credits, and an alternative for one who would rather keep theirs. The token is sent with the checkout request and `decideCheckoutSeat` uses it to bypass the already-booked and class-full refusals, both of which the recipient's own held seat triggers (count or the manually-set `full` flag; a cancelled class still refuses everyone, as the credit path does). Checkout then carries `offerToken` and `heldBookingId` in the Stripe session metadata, and the webhook's `decidePaidSeat` converts that held booking in place — payment reference recorded, waiting-list entry removed, occupancy untouched because the offer already counted the seat, existing confirmation and admin notification sent. Without that conversion the handler read the held seat as a duplicate delivery and returned early: no booking, no email, seat still held and the money silently kept. A repeated delivery finds the booking already confirmed and writes nothing. `decidePaidSeat` never refuses — by then the customer is charged, so it does not consult capacity and does not re-check the deadline; if the hold was withdrawn under them they get an ordinary booking through `forceClaimSeat` instead.
- **An offer nobody answered:** Withdrawal and expiry reach the same state through the same write — `releaseHeldSeat` in `src/lib/waitlist/settlement.ts`: the held booking is deleted, its seat is freed, the offer fields come off the waiting-list entry and the person keeps their place on the list. They differ only in what triggers them and in whether the recipient is told: expiry sends one gentle note (the place has gone back, they are still on the list for that class), a withdrawal sends nothing because Gabrielle has already replied to that person herself. Expiry is settled by the daily job (`settleExpiredOffers` in `src/lib/waitlist/daily.ts`), matched on `status = 'held'` so a class cancelled earlier — whose held bookings are already cancelled and whose entry is deliberately left intact — is never touched. Nothing depends on the job being punctual: `hasOfferLapsed` is the single reading of "expired" and every reader applies it, so a late or missed run delays the email and the digest and changes no decision. The seat is released only if the guarded delete matched, so a seat taken up in the meantime is left alone and its holder hears nothing.
- **The daily digest:** One email to Gabrielle, and only when something needs her — three sections: free seats on upcoming classes with people waiting and no offer against them, offers still outstanding with their deadlines, and card payers released more than a week ago who have not been rescheduled. Each entry names the class and date and links into the admin page it is acted on from. Sections and suppression are decided in `src/lib/waitlist/digest.ts` (`buildAdminDigest`); an empty digest is **not sent**, so one arriving always means something is waiting. A lapsed offer counts as a free seat with its holder waiting again, so the digest says the same thing whether the settling job has caught up or not. There is deliberately **no automatic advancement down the waiting list** — the digest prompts her, it never offers a seat for her, because she may skip someone for reasons the system cannot know.
- **Where the daily job lives:** Folded into `/api/cron/retry-emails` (`runDailyOfferWork`), after the email retries and guarded so it cannot cost anyone their confirmation. This plan permits only daily schedules and the permitted *number* of `vercel.json` entries was never confirmed from documentation, so the work went where a daily run already happens rather than risking a second entry. If a second entry is ever confirmed to be allowed, split it out — the route name is the only thing the fold costs.
- **Occupancy cannot exceed capacity:** `CHECK (booked_count >= 0 AND booked_count <= capacity)` on `schedules` (migration `0014`). Every capacity gate in the application is a read, and a read cannot refuse a write a concurrent one has already made — `claimSeat` closed that for the guarded paths by putting the check in the UPDATE's WHERE clause, and the constraint closes it for the rest. Consequences, all of them deliberate:
  - **A paid booking on a full class raises the capacity** rather than being refused (`forceClaimSeat`) — the customer is charged by then, so refusing them is the wrong outcome, and occupancy must not record a seat the class does not admit. The raise is logged from the webhook. It replaces the old oversold state and the "over capacity" badge that showed it: there is no over-capacity row left to badge, so the badge is gone. Raising the number is not something a customer can do at will — it takes a sale onto a class that is already full, and capacity is otherwise Gabrielle's to set.
  - **Capacity cannot be cut below the seats already taken.** `PUT /api/admin/schedules` answers 400 naming the number in the way, so the refusal reads as an explanation on the schedule form rather than a 500 — the bookings have to be cancelled or released first.
  - Migration `0014` reconciles the rows that predate it: an oversold class gains the capacity to match its bookings (clamping the count instead would throw away the fact that those people are coming), and a negative count — which nothing should have produced, every release being clamped — goes to zero.
- **Held seats elsewhere:** `held` is a booking status like any other in occupancy terms, so anywhere occupancy is shown to Gabrielle it is called out separately (`heldCount` on `/api/admin/schedules`, the status badge and payment column on `/admin/bookings`). Held bookings are excluded from the confirmation-email retry cron and from admin resend — nobody has taken them up yet.
- **Bundle credits:** `src/lib/bundles/credits.ts` owns every write to `bundles.creditsRemaining` — routes never compute a balance and write it back. `spendCredit` is a guarded, atomic debit (the credit check is the UPDATE's WHERE clause, and Postgres computes the new balance from the row it locks) that returns `{ spent: false }` rather than throwing, and marks a bundle spent to nothing `exhausted`; `refundCredit` gives one back clamped at `creditsTotal` (`LEAST`) and re-activates an exhausted bundle, leaving an expired one expired. Both sides of the same invariant in one place: the debit used to be JS arithmetic on a row read before the transaction opened, so two redemptions of one credit booked two classes. `/api/book/redeem` spends inside its transaction and **throws** when the debit is refused — that throw is both the 409 and the rollback of the booking and the seat claimed against it. `0 <= credits_remaining <= credits_total` is a CHECK on `bundles` (migration `0016`), for the caller that expresses neither guard.
- **Which bundle gets spent:** `findSpendableBundle` is the one read that chooses, and the rule is **soonest expiry first**, ties broken by `id` (the older purchase). A customer holding two bundles should spend the credits that would be lost first; the read was previously unordered and could leave the closer bundle to expire unspent. `/book/offer/[token]` shows the balance through the same read, so the number on the page is the bundle that will be spent. Criteria are an object, so matching a bundle to the class being booked (#37) is a field there rather than a reshaping of callers.
- **Booking transitions:** Cancel/release/reschedule rules live in `src/lib/bookings/transitions.ts` as pure functions that take rows and return the intended transition. Put new rules there (unit-tested in `tests/lib/booking-transitions.test.ts`) and keep `/api/admin/bookings` as wiring. A rule that only the reschedule sheet applies is not enforced: **a date in the past is refused by `decideReschedule` itself**, which takes the target's `date` and a `today` (`londonDateString`, Gabrielle's day rather than the runtime's UTC one), because a direct `PUT` naming a past schedule used to move the seat and email the customer a date gone by. Today's class is still allowed — it may not have started. `selectRescheduleTargets` keeps the same filter as UX, so the sheet never offers a date the server would then refuse.
- **Deleting a schedule:** refused only when a booking on it still **holds a place** (`holdsAPlace` in `src/lib/bookings/transitions.ts`, stated as "not cancelled and not released" so an unfamiliar status still blocks). A class set up by mistake whose one booking was cancelled has nobody attending and can be deleted; one with a `confirmed`, `held` or `waitlisted` booking cannot. Deleting it takes **everything still pointing at it** with it, in one transaction: the waiting list first (an entry left by a voided offer still names the held booking), then the cancelled and released bookings, then the schedule — and `originalScheduleId` is cleared on bookings that were moved *off* it, which live on another class and must survive. Every one of those is an `ON DELETE no action` foreign key, so Postgres refuses the parent delete while any of them exists, whatever the status says: the guard alone answered 500 on exactly the class it was written to let through. The rows are cleared here rather than by an `ON DELETE CASCADE` in the schema so the destruction stays behind the guard that decided it was safe, instead of applying to every future path that deletes a schedule. Stripe stays the record of any money taken. Tests: `tests/integration/schedule-delete.test.ts` — no mock can refuse a write, so the mocked test could not see this.
- **`numberOfWeeks` is a row count:** every week asked for becomes a schedule in one insert, so it is bounded at 52 in the schema (`/api/admin/schedules`, POST and PUT). The form's `max="52"` is an HTML attribute a direct call ignores.
- **Confirmation emails:** Sent via Resend after Stripe webhook using `after()` from `next/server`. Customer gets HTML confirmation (branded with logo), Gabrielle gets plain text notification. `emailSent` flag on bookings/bundles tracks delivery; cron retries failures daily at 8am (24-hour cutoff), and the same run does the daily offer work. Vercel Hobby only allows daily cron jobs.
- **Vercel Cron:** Configured in `vercel.json`. Cron endpoints at `/api/cron/*` are protected by `CRON_SECRET` bearer token.
- **DB transactions:** Multi-step mutations (e.g., booking insert + count increment) wrapped in `db.transaction()` for atomicity.
- **CI/CD:** GitHub Actions runs lint, typecheck, and test on PRs and pushes to master. No secrets needed in CI: the mocked tests need nothing, and the integration project needs only the ephemeral Postgres the runner creates and destroys.
- **Three test projects:** `vitest.config.ts` defines `unit` (every `.test.ts` in `tests/` except `tests/integration/`, drizzle mocked, no database), `dom` (every `.test.tsx`, jsdom, components rendered) and `integration` (`tests/integration/**`, real Postgres). `just test` runs all three; `just test-unit` runs the two mocked ones, which need no database.
- **Which kind to write:** default to a **mocked** test — they are the fast ones, and a rule that is a decision belongs in a pure function that needs no database at all (`src/lib/bookings/transitions.ts`, `src/lib/waitlist/offers.ts`, `src/lib/waitlist/digest.ts`). Write an **integration** test when the behaviour under test is Postgres's, not TypeScript's, and so a mock would only be asserting the shape of the statement you just wrote:
  - **SQL that has to execute** — the `GREATEST`/`LEAST` clamps, `CASE` expressions, anything inside a `sql` template.
  - **Constraints and indexes** — `bookings_schedule_email_active_idx` is the only real defence against a double booking, and no mock can refuse a write.
  - **Concurrency** — a guarded claim like `claimSeat` is only interesting when two of them race for one seat.
  - **Transaction boundaries** — that a failure part way through leaves nothing behind.
  - **A route end to end**, when the point is what the rows look like afterwards rather than which calls were made. `tests/integration/admin-bookings-cancel.test.ts` is the worked example: it asserts the bundle has 3 credits and the class 3 seats taken, not that `update` was called.
  Assert values, not call counts — an integration test that checks a mock was called has paid for a database and bought nothing.
- **How the integration project runs:** `tests/integration/support/global-setup.ts` drops, recreates and migrates `moontide_integration` once per run, so the schema under test is the one the migrations produce and a broken migration fails the tests. `support/setup.ts` truncates every table in `public` before each test (`RESTART IDENTITY CASCADE`), so tests are independent, ids are predictable and a crashed run leaves nothing to clean up. Truncation rather than a rolled-back transaction because the code under test uses the `db` singleton and opens transactions of its own. Files run serially — they share one database.
- **Which Postgres the tests use:** `TEST_DATABASE_URL`, defaulting to docker-compose's server (`postgresql://postgres:postgres@localhost:5432/postgres`). Deliberately **not** `DATABASE_URL` — that points at whatever Doppler config is loaded, possibly a Neon branch, and the harness drops the database it is given. Only ever point it at a throwaway server. `tests/integration/support/factories.ts` has the row builders; add to those rather than hand-rolling inserts.
- **Migrations in CI:** Two jobs in `.github/workflows/ci.yml` run the migrations against a Postgres service container the runner creates and destroys, so a migration that cannot apply fails the PR rather than the Vercel deploy (`"build": "drizzle-kit migrate && next build"` used to be the first thing that ever ran one). `migrations-empty` applies them all from scratch. `migrations-existing` applies the migrations as they stood on the base commit, loads `drizzle/ci/seed.sql`, then applies this branch's — so a migration meets rows, not empty tables. No credentials are involved: the container's password protects nothing and no real database is reachable from CI. Every migrate step falls through to `scripts/ci/explain-migration-failure.mjs` on failure, because drizzle-kit exits 1 printing nothing but its spinner — the explainer replays the pending migrations statement by statement in a rolled-back transaction and names the one Postgres rejected.
- **Migrations must be re-runnable:** `migrations-existing` finishes by forgetting the migrations this branch adds (`scripts/ci/forget-new-migrations.mjs` deletes their rows from `drizzle.__drizzle_migrations`) and applying them again. Drizzle picks migrations by their journal timestamp, not by filename or hash, so one that is renumbered or re-stamped while resolving a merge reads as unapplied on a database a preview deploy already migrated, and its DDL runs a second time. So write new migrations idempotently — `ADD COLUMN IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`, and for constraints a `DO $$ ... EXCEPTION WHEN duplicate_object OR duplicate_table THEN null; END $$` block (a repeated UNIQUE constraint raises `duplicate_table`, because the clash is with the index it creates). Only migrations absent from the base commit are replayed, so the older non-idempotent ones are left alone.
- **Renumbering a migration:** When a merge puts two migrations in the same numbered slot, rename the losing file but **keep its `when` in `_journal.json`** — re-stamping it re-runs its DDL on a database that already applied it (a preview deploy of an unmerged branch migrates stg), and stamping it below the entry before it makes drizzle skip it forever. Full rule, both constraints and the PR #40 worked example: `docs/agents/migrations.md`.
- **The CI seed:** `drizzle/ci/seed.sql` is not a test fixture (the suite is entirely mocked) and not the dev seed — it exists to make migrations meet data, so it wants breadth over volume: every status of every table and the awkward rows. CI reads it **as it stood on the base commit**, because it stands for data that already exists and so must match the schema that exists before the branch's migrations run. Write it against the schema on master; a PR that adds a column should not add it here in the same breath.
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

## Agent skills

### Issue tracker

Issues are tracked as GitHub Issues on `lennons301/moontide`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Review gates

Estate defaults plus three repo gates — `payments` (Stripe, booking, pricing paths), `notifications` (cron routes and the email helper) and `deploy-config` (`vercel.json`/`vercel.ts`, where cron schedules live). Matching PRs get `human-signoff` and wait for a human merge. See `docs/agents/review-gates.yaml`.

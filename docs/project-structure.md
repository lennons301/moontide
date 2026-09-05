# Project structure

The full annotated tree of this repo: one line per module, saying what that module is for. `AGENTS.md` carries only the directory-level summary and points here.

Keep it in step: when you add a module, add its line here in the same PR (and update the summary in `AGENTS.md` if a new directory appears). The annotations are the point — a file's name says where it is, its line here says why it exists.

```
src/
  app/                    # Next.js App Router pages
    api/
      auth/[...all]/      # Better Auth API handler
      contact/            # Contact form POST endpoint (zod-validated, address normalised)
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
        classes/          # CRUD for classes: create, edit (title/slug included), deactivate (soft delete only)
        pricing/          # GET/PUT bundle config only — class pricing moved to classes/
        bookings/         # GET all bookings
        bundles/          # GET all bundles
        messages/         # GET contact submissions
      cron/
        retry-emails/     # Cron (daily): retry every notification nobody has received, then the daily offer work
      revalidate/           # Sanity webhook for on-demand ISR revalidation
    admin/
      login/              # Admin login page
      classes/            # Create, edit and deactivate classes, including renaming a slug (no hard delete)
      schedule/           # Schedule management (CRUD)
      pricing/            # Manage bundle config only — class pricing lives on /admin/classes
      bookings/           # View bookings
      bundles/            # View bundles
      messages/           # Contact message inbox
    book/
      bundle/             # Bundle purchase page
      confirmation/       # Post-payment confirmation
    studio/[[...tool]]/   # Embedded Sanity Studio at /studio
    classes/[slug]/       # Dynamic class detail pages; 308s a renamed slug on to the current one
  components/
    ui/                   # shadcn/ui components (button, input, textarea, label, sheet)
    admin/                # Shared chrome for the admin tables
      admin-fetch.ts          # The only way an admin page talks to /api/admin/*
      use-table-controls.ts   # Search + sort + filter state, and deriveTableRows
      admin-table-toolbar.tsx # Search box, filter slot, "showing n of m"
      table-headers.tsx       # SortableHead + SortHeader/PlainHeader (sort state by context)
      table-filters.ts        # The status/class/upcoming-or-past filter set
      table-state.tsx         # What a table says instead of rows: loading, failed, empty
      class-filter-select.tsx # The class filter, beside the pills
      pill-group.tsx          # Single-choice filter pills
      status-badge.tsx        # Every admin status colour, in one map
      admin-alert.tsx         # A refusal, said on the page rather than in an alert box
      format-date.ts          # The four date shapes the admin uses, plus todayString
      resend-email-button.tsx # Resend a confirmation, whatever the flag says
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
      rows.ts             # The shapes /api/admin/* answers with, from the Drizzle schema
      navigate.ts         # goToLogin — where a 401 sends the operator
    stripe.ts             # Stripe client singleton
    classes/
      categories.ts       # CLASS_CATEGORIES / BOOKING_TYPES — the one list, safe for a client page to import
      slug-redirects.ts   # Records a slug rename (refusing a collision on create too), and resolves a stale slug to the class's current one
    bookings/
      transitions.ts      # Pure cancel/release/reschedule decisions (no DB)
    customers/
      email.ts            # The one place an address is folded, and the case-insensitive match for a WHERE
    bundles/
      credits.ts          # Sole owner of bundles.creditsRemaining writes, and the read that picks the bundle
      purchase.ts         # The terms a bundle was sold on: the session's metadata keys, and expiry from when she paid
      with-config.ts      # The one bundle→config join, and the one way to word a bundle confirmation
    db/
      index.ts            # Drizzle client (postgres.js driver)
      schema.ts           # Drizzle schema (all tables including bundleConfig + re-exports auth-schema)
      auth-schema.ts      # Better Auth tables (user, session, account, verification)
    content/             # Every CMS read, and every fallback for one
      source.ts           # The ContentSource seam: the Sanity adapter, and fetchOrNull
      in-memory-source.ts # The other adapter: a CMS held in a variable, for tests
      fallbacks.ts        # One copy of every piece of hardcoded content
      services.ts         # getClassCatalogue() / getService(slug) / getServices() / getServicePagePaths()
      trainer.ts          # getTrainer() — the one trainer fallback, shared by / and /about
      community.ts        # getCommunityEvents()
      site-settings.ts    # getSiteSettings() — hero tagline, Instagram link
      homepage.ts         # The homepage's three sections, composed from the above
    sanity/
      client.ts           # Sanity client + urlFor() image helper
      queries.ts          # GROQ queries — imported only by src/lib/content/
      types.ts            # TypeScript types for Sanity documents
    schedule-occupancy.ts # Sole owner of schedules.bookedCount writes
    notifications/        # Everything about telling somebody something
      index.ts            # notify(event, record) — the one interface, and the one `after`
      events.ts           # The domain events a caller can name
      policy.ts           # Who hears about each one, and Gabrielle's address, once
      templates.ts        # The words of all twelve copies, and nothing else
      format.ts           # Every date shape, the layout, the links — one each
      adapter.ts          # The Resend seam, and the one `from` address
      in-memory-adapter.ts # The other adapter: a mailbox in a variable, for tests
      delivery.ts         # Sole owner of the emailSent/attempts/sentAt/lastError columns
      retry.ts            # The unbounded sweep: every notification nobody has received yet
      booking-emails.ts   # Which notification a booking owes
    schedules/
      availability.ts     # The one definition of "can this class take a booking", and of seats left
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
  support/fetch-stub.ts    # A stubbed fetch keyed "<METHOD> <path>", for the admin pages
  app/admin/*.test.tsx     # The admin pages rendered: 401, a non-JSON 502, refusals shown
  admin/with-admin.test.ts # The request module: auth, parsing, error shape
  admin/routes-are-protected.test.ts # Every /api/admin handler, signed out and demoted
  admin/bookings.test.ts      # Booking list + cancel/release/reschedule wiring
  admin/bundles.test.ts       # Bundle list
  admin/classes.test.ts       # Classes CRUD API: list (active or all), create, update, deactivate
  admin/messages.test.ts      # Contact message read flag
  admin/resend-email.test.ts  # Resending a booking or bundle confirmation
  admin/validation-messages.test.ts # No admin refusal is phrased by zod
  components/admin/*.test.tsx # Rendered admin chrome (PillGroup, headers, badge, table state)
  components/admin/admin-fetch.test.ts # requestAdmin/mutateAdmin: 401, non-JSON, refusals
  components/admin/use-admin-resource.test.tsx # The hook: loading, error, refetch, enabled
  components/admin/use-table-controls.test.ts # deriveTableRows / toggleSortState
  components/admin/format-date.test.ts # The four date shapes, and todayString
  components/admin/table-filters.test.ts # Status/class/time filter composition
  lib/admin-pricing-changes.test.ts # Pricing diff: summary and payload agree
  api/contact.test.ts     # Contact form API tests, and what it refuses
  lib/customer-email.test.ts # normaliseEmail: the case and whitespace folded away
  lib/email-normalisation-is-one-place.test.ts # No handler folds an address itself
  lib/delivery-state-is-one-place.test.ts # No handler marks an email sent itself
  api/stripe-webhook.test.ts  # Stripe webhook handler tests
  api/book-checkout.test.ts   # Checkout session tests
  api/book-redeem.test.ts     # Bundle redemption tests
  admin/schedules.test.ts     # Admin schedule API tests
  api/admin-pricing.test.ts   # Admin pricing API tests
  lib/notifications.test.ts # Every event: who is told, and what it says
  lib/notifications-are-one-place.test.ts # from, admin, Resend, en-GB and `after`, each held at one
  lib/bundle-purchase.test.ts # Terms fixed at purchase: session over config, expiry from payment
  lib/booking-transitions.test.ts  # Cancel/release/reschedule decision tests
  lib/schedule-occupancy.test.ts  # Seat claim/release semantics
  lib/schedule-availability.test.ts # Bookability and seats left: open, closed, full, unknown
  lib/waitlist-offers.test.ts # Seat offer decision rules
  lib/waitlist-cancellation.test.ts # Voiding offers when a class is cancelled
  lib/waitlist-digest.test.ts # Which entries go in which digest section
  api/cron-offer-sweep.test.ts # Expiry settlement + digest through the daily route
  api/cron-retry-emails.test.ts # The sweep: what each kind sends, what it leaves, one row failing
  lib/london-time.test.ts     # Class starts across the BST boundary
  admin/waitlist.test.ts      # Waiting list API tests
  admin/waitlist-offer.test.ts # Offer/withdraw route wiring
  support/content.ts      # What the CMS holds for one test, or that it is unreachable
  support/sanity-client.ts # The client module stubbed: reading it directly fails
  support/classes.ts      # The classes table stubbed: what getClassCatalogue() reads back
  lib/content.test.ts     # Every content question, with the CMS up and with it down
  lib/content-source.test.ts # The seam: fetchOrNull, and the in-memory adapter
  lib/cms-reads-go-through-content.test.ts # Nothing outside src/lib/content reads Sanity
  lib/homepage-content.test.ts # Homepage CMS fallbacks, section by section
  components/class-catalogue-navigation.test.tsx # A catalogue class is reachable from nav, footer and /about alike
  app/homepage.test.ts    # Homepage renders with the CMS up and with it down
  app/content-pages.test.ts # /about, /coaching, /private, /community, /classes/[slug]
  app/layout.test.ts      # Root layout renders every page when Sanity or the classes table throws
  integration/            # Runs against a real Postgres, not mocks
    support/database-url.ts # Which server, and the throwaway database on it
    support/global-setup.ts # Drop, create and migrate that database, once per run
    support/setup.ts        # Empty every table before each test
    support/factories.ts    # Rows to test against
    schedule-occupancy.test.ts # Real occupancy numbers, clamps and a seat race
    booking-constraints.test.ts # The unique indexes, refusing duplicates and case variants
    case-variant-reconciliation.test.ts # Migration 0017 applied to the duplicates it forbids
    bundle-constraints.test.ts # One bundle per payment, the config it came from, the credit range
    capacity-constraints.test.ts # The CHECK refusing occupancy over capacity, and the route narrowing it
    bundle-credits.test.ts  # Real balances, the clamps and a race for one credit
    admin-bookings-cancel.test.ts # A route end to end: request in, rows out
    book-redeem.test.ts     # Redemption end to end: which bundle, and two racing for one credit
    schedule-delete.test.ts # Deleting a class: what goes with it, what survives
    email-delivery-state.test.ts # Attempts counted in SQL, and what a failure leaves behind
drizzle/
  migrations/             # Generated Drizzle migrations
  ci/seed.sql             # Production-shaped data the CI migration check runs against
```

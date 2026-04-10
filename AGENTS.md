# Moontide

Wellbeing website for women navigating change through yoga, coaching, and embodied connection.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.7
- **Database:** Neon (Postgres) with Drizzle ORM
- **CMS:** Sanity (project ID: 77icfczp, dataset: production)
- **Auth:** Better Auth (admin-only, Phase 2)
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
    api/contact/          # Contact form POST endpoint
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
    db/
      index.ts            # Drizzle client (postgres.js driver)
      schema.ts           # Drizzle schema (contact_submissions)
    sanity/
      client.ts           # Sanity client + urlFor() image helper
      queries.ts          # GROQ queries for all document types
      types.ts            # TypeScript types for Sanity documents
    email.ts              # Resend email helper (sendContactEmail)
  sanity/
    schema/               # Sanity document schemas (siteSettings, service, page, trainer, communityEvent)
    structure.ts          # Sanity Studio desk structure
scripts/
  seed-sanity.ts          # CMS seed script
tests/
  api/contact.test.ts     # Contact form API tests
  lib/email.test.ts       # Email helper tests
drizzle/
  migrations/             # Generated Drizzle migrations
```

## Key Conventions

- **Package manager:** pnpm (not npm). Use `pnpm add`, `pnpm exec`, `pnpm dlx`.
- **Secrets:** Managed via Doppler — never commit .env files. Use `doppler run --` to inject.
- **CMS boundary:** Editorial content (text, images, descriptions) → Sanity. Transactional data (bookings, contact submissions) → Neon Postgres.
- **Tailwind CSS v4:** No tailwind.config.ts. Colours configured via `@theme inline` in globals.css. Custom palette: deep-current, deep-ocean, shallow-water, lunar-gold, driftwood, foam-white, seagrass.
- **Design:** Mobile-first, photography-led, light and inviting. Theme: "Calm, luminous and gently energising — like light moving across water."
- **Nav layout:** Burger menu left, logo (MOONTIDE) right.
- **Services grouping:** Classes shown as 2x2 photo grid, coaching/private as featured cards, community as light text block.
- **Sanity images:** Use `urlFor(image).width(x).height(y).url()` from `@/lib/sanity/client`.
- **Page fallbacks:** All content pages try Sanity first, fall back to hardcoded content if CMS returns null.
- **Local dev:** Docker Compose for Postgres, mise for tool versions, just for commands, Doppler for secrets.
- **Postgres driver:** Use `postgres` (postgres.js), not `@neondatabase/serverless` — must work with local Docker.
- **Revalidation:** Homepage uses `revalidate = 60` for ISR. Content pages are static with Sanity fallbacks.
- **Linting:** Biome runs on pre-commit via husky. Run `just lint` to check/fix manually.

## Environments

| Environment | Database | Secrets | URL |
|-------------|----------|---------|-----|
| dev | Local Docker Postgres | Doppler dev | localhost:3000 |
| stg | Neon staging branch | Doppler stg | Vercel preview |
| prd | Neon production | Doppler prd | moontide-six.vercel.app (domain TBC) |

## Platform Context

Platform standards and choices: see ~/code/platform/
This project's registry entry: products/moontide.yaml

# Moontide

Wellbeing website for women navigating change through yoga, coaching, and embodied connection.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.7
- **Database:** Neon (Postgres) with Drizzle ORM
- **CMS:** Sanity (project ID: 77icfczp)
- **Auth:** Better Auth (admin-only)
- **Payments:** Stripe Checkout + webhooks
- **UI:** shadcn/ui + Tailwind CSS v4
- **Email:** Resend
- **Testing:** Vitest

## Prerequisites

- [mise](https://mise.jdx.dev/) — manages tool versions (Node, pnpm, etc.)
- [Docker](https://www.docker.com/) — local Postgres via Docker Compose
- [Doppler](https://www.doppler.com/) — secrets management (request access to project: `moontide`)
- [just](https://just.systems/) — task runner (installed via mise)

## Getting Started

```bash
just setup   # First-time setup: install deps, run migrations, seed DB
just dev     # Start the dev server (Docker + Doppler + pnpm)
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Commands

| Command | Description |
|---------|-------------|
| `just dev` | Start dev server (Docker + Doppler + pnpm) |
| `just build` | Production build |
| `just test` | Run tests (Vitest) |
| `just lint` | Lint and format (Biome) |
| `just typecheck` | Type check (tsc --noEmit) |
| `just setup` | First-time setup |
| `just db-migrate` | Apply database migrations |
| `just db-generate` | Generate database migrations |
| `just db-seed` | Seed local database |
| `just db-seed-cms` | Seed Sanity CMS content |
| `just db-studio` | Open Drizzle Studio |

## Project Structure

```
src/
  app/          # Next.js App Router pages and API routes
  components/   # React components (UI, layout, page sections)
  lib/          # Shared utilities (db, sanity, auth, stripe, email)
  sanity/       # Sanity Studio schema and structure
scripts/        # Seed scripts
tests/          # Vitest tests
drizzle/        # Generated migrations
```

See [AGENTS.md](./AGENTS.md) for the full project structure and key conventions.

## CMS

Editorial content is managed in Sanity. The embedded Studio is available at `/studio` when running locally.

- Sanity project: `77icfczp`, dataset: `production`
- CMS guide: [docs/cms-guide.md](./docs/cms-guide.md)

## Environments

| Environment | Database | Secrets | URL |
|-------------|----------|---------|-----|
| dev | Local Docker Postgres | Doppler dev | localhost:3000 |
| stg | Neon staging branch | Doppler stg | Vercel preview |
| prd | Neon production | Doppler prd | moontide-six.vercel.app (domain TBC) |

## CI/CD

GitHub Actions runs lint, typecheck, and tests on all PRs and pushes to `master`. No secrets are needed in CI — all tests use mocks.

Vercel deploys automatically: pushes to `master` deploy to production, all other branches create preview deployments.

## Secrets

All secrets are managed via [Doppler](https://www.doppler.com/) (project: `moontide`). The Doppler-Vercel integration auto-syncs secrets to Vercel — never set env vars in Vercel manually for anything Doppler manages.

For local development, `just dev` injects secrets via `doppler run --`.

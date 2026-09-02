# Moontide — command runner
# Run `just --list` to see all available commands

# Start development server (requires Docker + Doppler)
dev:
    docker compose up -d
    doppler run -- pnpm run dev

# Run test suite (unit + integration; integration needs a Postgres)
test:
    #!/usr/bin/env bash
    set -euo pipefail
    # The integration project builds its own database on the local Postgres.
    # CI already has one as a service container, so only dev has to start it.
    if [ -z "${CI:-}" ]; then
        docker compose up -d --wait postgres
    fi
    pnpm run test

# Run only the mocked tests — no database, no Docker
test-unit:
    pnpm run test:unit

# Lint and format
lint:
    pnpm exec biome check --write .

# Type check
typecheck:
    pnpm exec tsc --noEmit

# Production build
build:
    pnpm run build

# First-time setup
setup:
    mise install
    pnpm install
    docker compose up -d
    doppler setup
    doppler run -- pnpm run db:migrate
    @echo "✓ Setup complete. Run 'just dev' to start."

# Apply database migrations
db-migrate:
    doppler run -- pnpm run db:migrate

# Generate database migrations
db-generate:
    doppler run -- pnpm run db:generate

# Seed local database
db-seed:
    doppler run -- pnpm run db:seed

# Seed Sanity CMS content
db-seed-cms:
    doppler run -- pnpm exec tsx scripts/seed-sanity.ts

# Open Drizzle Studio
db-studio:
    doppler run -- pnpm run db:studio

# Forward Stripe webhooks to local dev server
stripe-listen:
    stripe listen --forward-to localhost:3000/api/stripe/webhook

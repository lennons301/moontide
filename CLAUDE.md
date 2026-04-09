# Moontide

Wellbeing website for women navigating change through yoga, coaching, and embodied connection.

## Tech Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5.7
- **Database:** Neon (Postgres) with Drizzle ORM
- **CMS:** Sanity
- **Auth:** Better Auth (admin-only)
- **UI:** shadcn/ui + Tailwind CSS
- **Email:** Resend
- **Deployment:** Vercel Hobby

## Commands

```bash
npm run dev          # Start dev server (requires: docker compose up -d && doppler run --)
npm run build        # Production build
npm run lint         # Linting
npm run test         # Run tests
npm run db:migrate   # Apply database migrations
npm run db:seed      # Seed database with dev data
```

## Project Structure

```
src/
  app/              # Next.js App Router pages
  components/       # React components (shadcn/ui in components/ui/)
  lib/              # Database, Sanity client, email, utilities
  sanity/           # Sanity schema definitions
```

## Key Conventions

- Secrets managed via Doppler — never commit .env files
- Editorial content (text, images) lives in Sanity CMS
- Transactional data (bookings, contact submissions) lives in Neon Postgres
- Mobile-first responsive design
- Local dev uses Docker Compose for Postgres

## Platform Context

Platform standards and choices: see ~/code/platform/
This project's registry entry: products/moontide.yaml

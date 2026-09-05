# Postgres owns a class's title and slug; Sanity holds only its editorial content

**Status:** Accepted

## Context

A class is both editorial (title, prose, image) and transactional (price, category, schedule), so `AGENTS.md`'s stated boundary — editorial content to Sanity, transactional data to Postgres — didn't decide which system owns its title and slug. In practice both did: public pages (nav, footer, `/classes/[slug]`) read a title from Sanity, while Stripe line items, confirmation emails and admin tables read `classes.title` from Postgres. The two copies drifted independently — a class titled "Autumn Equinox Yin" in six places still lived at the URL `/classes/vinyasa` — and the drift reappeared within days of a prior attempt to fix it, because nothing enforced a single source (lennons301/moontide#38).

## Decision

Postgres `classes` is the single source of truth for a class's title, slug, category, price, active state and bundle eligibility. Sanity `service` documents supply only prose and image, matched to the Postgres row by slug — the Sanity document's own `title` and `slug` fields go unread wherever a class is shown; a page always takes those two from Postgres.

## Considered Options

- **Sanity owns title+slug, Postgres is a transactional shadow** (joined via the already-existing but unread `classes.sanityId`) — rejected because Postgres already governs everything else about a class (price, category, active state, the `schedules` FK), and Gabrielle needs to manage classes without code changes or redeploys, which the existing admin surface (`/api/admin/*`) already does for Postgres and does not do for Sanity.
- **Both keep a copy, with a stated sync direction** — rejected as strictly more moving parts than owning it in one place, and the two copies already had no defined sync and had already drifted twice.

## Consequences

- This is the repo's first deviation from the blanket rule in `AGENTS.md` ("Editorial content → Sanity. Transactional data → Neon Postgres"); that rule still holds everywhere else, and this ADR narrows it for classes specifically.
- The public-facing "catalogue" — nav, footer, `about`'s services list, `generateStaticParams`, `generateMetadata`, `revalidate`'s `pathsByType` — reads from Postgres instead of hardcoded arrays or Sanity (lennons301/moontide#116).
- Sanity's `service.title` and `service.slug` fields are left in the schema (existing documents already carry them, and the Studio still uses `slug` to address a document), but no page reads them for a class — Postgres' `title` and `slug` always win. Removing those fields from the Studio editing UI, and renaming them so an editor isn't offered a field that silently does nothing, is a follow-up once the fields are confirmed unread everywhere.
- Renaming an existing class (slug mutability + redirects) and giving Gabrielle a CRUD UI for the Postgres rows in the first place (lennons301/moontide#115) are each their own follow-up ticket.

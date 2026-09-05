# Moontide

Wellbeing website for women navigating change through yoga, coaching and embodied connection — bookings, classes and editorial content for one practitioner (Gabrielle).

## Language

**Class**:
A bookable class offering — title, slug, category, price and schedule — owned by Postgres `classes`. The single source of truth for what a class is called, costs, and whether it's active. See [ADR-0001](./docs/adr/0001-postgres-owns-class-title-and-slug.md).
_Avoid_: Service (when the transactional row is meant)

**Service**:
A Sanity CMS document holding editorial prose and image for a Class, or for the non-bookable pages (coaching, community, private). Its own `title` and `slug` fields are vestigial — Postgres' are what every page shows — and it is matched to its Class by slug.
_Avoid_: Class (a Service carries no price or schedule)

**Class catalogue**:
The single Postgres-derived list of classes that every presentation surface (nav, footer, static params, revalidation paths) reads from, rather than each holding its own hardcoded copy.
_Avoid_: Service list

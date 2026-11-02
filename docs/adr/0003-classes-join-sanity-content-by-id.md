# 3. A class's Sanity content is joined by `_id`, not by slug

## Status

Accepted

## Context

[ADR-0001](0001-postgres-owns-class-title-and-slug.md) made Postgres the
system of record for a class's title and slug, and matched a class to its
Sanity `service` document **by slug** — the Sanity document's own `title`
and `slug` fields were left in the schema but unread. That held only as long
as neither slug moved independently of the other.

It didn't. On production, the class `vinyasa`/"Autumn Equinox Yin" was
renamed to `yincircle` in `/admin/classes` (ADR-0002's slug mutability), and
the same Sanity document was separately re-slugged to `yin` in Studio. The
homepage built its tile's link from `service.slug.current`, so it linked to
`/classes/yin` — a page with Sanity content but no catalogue row. The nav
and footer, which link by the Postgres slug, correctly pointed at
`/classes/yincircle` — a page with a catalogue row but, once matched by
slug, no Sanity document. Two pages, one class, neither complete
(lennons301/moontide#131).

`classes.sanityId` has existed since the column was added and named as a
rejected alternative in ADR-0001's considered options, but nothing had ever
written to it.

## Decision

A class's Sanity content is found by `classes.sanityId` — the `service`
document's `_id` — not by comparing slugs. `_id` cannot be edited in Studio,
so it cannot drift the way two independently-editable slugs did.

- `getService(slug)` resolves the catalogue row by Postgres slug, then
  fetches that row's Sanity document by `_id`. A catalogue class with no
  `sanityId`, or whose document has been deleted, falls back to "Class
  details coming soon" — there is no slug-based fallback for a class, by
  design: a slug match is exactly the drift this ADR removes.
- The homepage's class tiles link using the slug of the Postgres class whose
  `sanityId` names the document being rendered, falling back to the
  document's own slug only when nothing is linked (an unlinked document, or
  an empty catalogue from an unreachable Postgres) — the same page-fallback
  posture every other CMS read has.
- `service.title` and `service.slug` are `readOnly` in Studio for documents
  with `category == "class"`, so an editor is not offered a field that does
  nothing for a class — both already read nowhere a class is shown, per
  ADR-0001, and now cannot be edited to look otherwise. They stay in the
  schema: existing documents carry them, and Studio still addresses a
  document by its `slug`.
- `/admin/classes` gains a "Page content" dropdown, read-only against
  Sanity (no write token), that sets `classes.sanityId`. This is the only
  place the link between a class and its content is made or changed.

The non-class pages (`coaching`, `community`, `private`) have no Postgres
row to carry a `sanityId`, so they keep the slug lookup — this decision is
about classes specifically, the same scope ADR-0001 drew.

## Consequences

- Renaming a class's slug in `/admin/classes`, or re-slugging its document
  in Studio (now only possible for a non-class service), can no longer
  orphan the other side of the join.
- A one-off migration backfills `sanityId` for the four classes seeded at
  launch, matched by current slug or by rename history — not a hardcoded
  slug — because which one applies differs by environment. It also records
  a redirect from `yin`, the stray slug the old slug-based join leaked onto
  the homepage, to the class it actually names, so the old link still
  resolves.
- `AGENTS.md`'s "Page fallbacks" and "CMS boundary" sections are updated to
  describe the `sanityId` join rather than the slug match.

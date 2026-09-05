# 2. Class slug renames keep redirects; bookings snapshot the class title

## Status

Accepted

## Context

`classes.slug` identifies a class for booking and admin purposes, and
`classes.title` is what a customer is called by — on the booking page, in
confirmation emails, in the admin tables. Nothing let either change: the
admin editor (#115) could edit a class's price, category and active state,
but not its slug, and there was nowhere a rename could go besides overwriting
the row in place.

That stuck one specific class: `vinyasa`/"Autumn Equinox Yin" has a slug that
no longer describes its title, because the title was changed by hand at some
point (migration `0008_rename_vinyasa_class_title`) and the slug was left
alone rather than risk 404ing whoever had the old link. #38's discussion
settled that this needs to be fixable from the admin UI — code-free and
redeploy-free — rather than left to another one-off migration.

[ADR-0001](0001-postgres-owns-class-title-and-slug.md) settled that Postgres
`classes` is the system of record for a class's title and slug, and named
slug mutability plus redirects, and a booking snapshotting the title it was
made with, as its own follow-up ticket (#117). This ADR is that follow-up.

## Decision

Postgres is the system of record for a class's *identity* — what it is
called and how it is addressed — for every booking and admin purpose:

- **A class keeps one id and one *current* slug.** Renaming a slug mutates
  the row in place; it does not fork a class into a new one.
- **Every slug a class has held is kept**, in `class_slug_redirects` (old
  slug, class id, created at), written automatically whenever the admin
  editor changes a slug. A request for an old slug found only in that table
  is redirected, permanently, to the class's *current* slug — resolving a
  chain of renames in one hop, because the table always points at the class
  directly rather than at the next link in the chain.
- **A booking snapshots the class's title at the moment it is made**, on
  `bookings.classTitle`. Confirmation emails and admin displays read it from
  there instead of joining `classes` live, so a later rename — of the title
  or the slug — never rewrites what a past booking shows.

## Consequences

- The admin class editor can rename a slug without breaking an old link, and
  without a migration, redeploy, or a fork of the class row.
- A booking's own record of "what this was for" is stable once made, which
  is the property emails and admin history actually need — not a live join
  that answers differently depending on when it is asked.
- The class detail page's rendering (`/classes/[slug]`, content from Sanity)
  is unaffected in the ordinary case: it still resolves content by the slug
  in the URL. It gains one additional check — is this slug recorded as
  someone else's old one? — ahead of that, so a stale link still lands
  somewhere useful instead of showing fallback copy for a slug nobody
  recognises.
- The looser link between a Postgres `classes` row and its Sanity content
  document (by `sanityId`, or by the two slugs agreeing) is unchanged by this
  decision and remains its own concern (#38).

# CMS Editability: Homepage Hero, About Preview, About Page Hero

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Make three currently-hardcoded sections editable via Sanity CMS, and add a hero image to the About page.

---

## Problem

Several prominent sections of the site have content hardcoded in React components that should be editable by Gabrielle in Sanity:

1. The homepage hero tagline (definition, pronunciation, italic text)
2. The homepage "about me" preview (short bio text and photo)
3. The About page has no hero image, unlike every other content page

---

## 1. Site Settings — Hero Tagline

### Schema change (`siteSettings`)

Add a `heroTagline` field (plain text, multiline) for the homepage hero text block. This replaces the hardcoded pronunciation/definition text.

```
heroTagline: text (multiline, optional)
```

Default/fallback: the current hardcoded text ("moontide\n/ˈmuːn.taɪd/ · noun\nThe pull of the moon on the tides — a reminder that change is natural, cyclical, and part of who we are.")

### Query change

The existing `siteSettingsQuery` already fetches from `siteSettings`. Add `heroTagline` to the projection.

### Rendering change (`Hero` component)

The Hero component currently hardcodes three `<p>` tags for the tagline. Instead, accept a `tagline` prop (string) and render it by splitting on newlines into paragraphs. If null/empty, use the current hardcoded text as fallback.

### Homepage data flow

The homepage (`src/app/page.tsx`) already fetches services and trainer. Add a `siteSettings` fetch (using the existing query) and pass `siteSettings.heroTagline` to the Hero component.

---

## 2. Trainer — Short Bio and Homepage About Preview

### Schema change (`trainer`)

Add a `shortBio` field (plain string, not rich text) for the one-liner used on the homepage about preview.

```
shortBio: string (optional)
```

Default/fallback: "Yoga teacher and transformational coach supporting women through every phase of life."

### Schema change (`trainer`) — Hero Image

Add a `heroImage` field (image with hotspot) for the About page hero banner.

```
heroImage: image (optional, hotspot: true)
```

### Query change

The existing `trainerQuery` needs `shortBio` and `heroImage` added to the projection.

### Type change

Add `shortBio?: string` and `heroImage?: Image` to the `Trainer` interface.

### Homepage about preview

The homepage currently passes a hardcoded `shortBio` string to `AboutPreview`. Change to:
- Pass `trainer.shortBio` (with hardcoded fallback if null)
- Pass `trainer.photo` as `photoUrl` (currently not passed at all — the photo exists in Sanity but the homepage doesn't use it)

---

## 3. About Page — Hero Image

### Rendering change

Add a hero image section at the top of the About page, matching the pattern used on class detail, coaching, community, and private pages:

```tsx
<div className="relative h-64 md:h-96 bg-ocean-light-blue/30">
  {imageUrl ? <Image ... /> : <placeholder />}
</div>
```

Use `trainer.heroImage` (not `trainer.photo` — that's the circular portrait). If `heroImage` is null, show the gradient placeholder.

---

## 4. CMS Guide Update

Update `docs/cms-guide.md`:
- Add `heroTagline` to the Site Settings section (and remove the "not currently wired" note — Site Settings is now partially wired)
- Add `shortBio` and `heroImage` to the Trainers section
- Update the "What you cannot edit" section to remove items that are now editable

---

## Files Changed

| File | Change |
|------|--------|
| `src/sanity/schema/site-settings.ts` | Add `heroTagline` field |
| `src/sanity/schema/trainer.ts` | Add `shortBio` and `heroImage` fields |
| `src/lib/sanity/queries.ts` | Add fields to `siteSettingsQuery` and `trainerQuery` projections |
| `src/lib/sanity/types.ts` | Add fields to `SiteSettings` and `Trainer` interfaces |
| `src/components/hero.tsx` | Accept `tagline` prop, render with newline splitting, fallback |
| `src/components/about-preview.tsx` | No change needed (already accepts `photoUrl` and `shortBio` props) |
| `src/app/page.tsx` | Fetch siteSettings, pass tagline to Hero, pass photo + shortBio to AboutPreview |
| `src/app/about/page.tsx` | Add hero image section using `trainer.heroImage` |
| `docs/cms-guide.md` | Document new editable fields |
| `AGENTS.md` | No change needed (revalidation already covers siteSettings and trainer) |

## Revalidation

Already handled — the webhook maps `siteSettings` → `/` and `trainer` → `/`, `/about`. No changes needed.

## Out of Scope

- Wiring footer/nav to siteSettings (separate task)
- Making button text or navigation CMS-editable

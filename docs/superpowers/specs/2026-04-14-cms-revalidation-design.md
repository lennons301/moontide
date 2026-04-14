# CMS Revalidation, Image Fix, Cleanup & User Guide

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Fix CMS content not appearing on production, add on-demand revalidation, fix image rendering, remove dead schema, write user documentation.

---

## Problem

Gabrielle has been editing services in Sanity (text, images, descriptions) but changes aren't appearing on the production site. Two root causes:

1. **No revalidation** — Most CMS-driven pages are statically generated at build time with no ISR or webhook. Only the homepage has `revalidate = 60`. All other pages (about, classes/*, coaching, community, private) are frozen at deploy time.

2. **Images blocked** — `next.config.ts` has no `images.remotePatterns` for `cdn.sanity.io`. Text from Sanity renders fine but images are blocked by Next.js's image optimizer.

Additionally, the `page` document type exists in the Sanity schema but is never used by the app — a source of confusion for CMS users.

---

## 1. Sanity Webhook Endpoint

### Route: `src/app/api/revalidate/route.ts`

Receives POST requests from Sanity when documents are published or deleted. Verifies a shared secret, maps the changed document type to affected URL paths, and calls `revalidatePath()` for each.

### Secret

A new `SANITY_WEBHOOK_SECRET` env var stored in Doppler (all configs). The webhook handler verifies this against a header or query parameter sent by Sanity.

### Document-to-path mapping

| Document type | Affected paths |
|---------------|---------------|
| `service` | `/`, `/classes/prenatal`, `/classes/postnatal`, `/classes/baby-yoga`, `/classes/vinyasa`, `/coaching`, `/community`, `/private` |
| `trainer` | `/`, `/about` |
| `communityEvent` | `/community` |
| `siteSettings` | `/` (currently unused by any page, but future-safe) |

When a `service` is published, all service-dependent pages are revalidated. This is simpler than parsing which specific service changed — there are only ~8 paths and revalidation is cheap.

### Sanity webhook configuration

In Sanity dashboard (manage.sanity.io) → project 77icfczp → API → Webhooks:
- **Name:** Vercel revalidation
- **URL:** `https://<production-domain>/api/revalidate`
- **Trigger on:** Create, Update, Delete
- **Filter:** `_type in ["service", "trainer", "communityEvent", "siteSettings"]`
- **Projection:** `{_type, slug}`
- **HTTP method:** POST
- **Secret:** Value of `SANITY_WEBHOOK_SECRET` from Doppler
- **HTTP Headers:** `Content-Type: application/json`

### Response

- `200` with `{ revalidated: ["/", "/about", ...] }` on success
- `401` if secret doesn't match
- `400` if payload is unparseable

---

## 2. ISR Fallback on All CMS Pages

Add `export const revalidate = 3600` (1 hour) to every CMS-driven page as a safety net. The webhook handles the fast path; ISR catches anything the webhook misses (e.g. if the webhook endpoint is temporarily unreachable).

Pages to update:

| Page | File | Current | New |
|------|------|---------|-----|
| Homepage | `src/app/page.tsx` | `revalidate = 60` | `revalidate = 3600` |
| About | `src/app/about/page.tsx` | none (static) | `revalidate = 3600` |
| Class detail | `src/app/classes/[slug]/page.tsx` | none (static) | `revalidate = 3600` |
| Coaching | `src/app/coaching/page.tsx` | none (static) | `revalidate = 3600` |
| Community | `src/app/community/page.tsx` | none (static) | `revalidate = 3600` |
| Private | `src/app/private/page.tsx` | none (static) | `revalidate = 3600` |

Homepage changes from 60s to 3600s because the webhook now handles immediate updates — no need to poll every minute.

---

## 3. Fix Sanity Image Rendering

Add `images.remotePatterns` to `next.config.ts` to allow Next.js Image component to optimize Sanity CDN images:

```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
  },
};
```

---

## 4. Remove Unused `page` Document Type

Remove from:
- `src/sanity/schema/page.ts` — delete file
- `src/sanity/schema/index.ts` — remove import and array entry
- `src/lib/sanity/queries.ts` — remove `pageBySlugQuery`
- `src/lib/sanity/types.ts` — remove `Page` interface

If any `page` documents exist in the Sanity dataset, they'll remain in the datastore but won't appear in Studio. They can be deleted manually via Sanity Studio's "All content" view or left to rot harmlessly.

---

## 5. CMS User Guide

Create `docs/cms-guide.md` — a plain-language reference for Gabrielle. Covers:

### What's editable in the CMS

| Content | Where in Sanity | Where it appears on the site |
|---------|----------------|------------------------------|
| Class descriptions & images | Services → (prenatal / postnatal / baby-yoga / vinyasa) | Homepage grid + class detail pages |
| Coaching description & image | Services → coaching | Coaching page |
| Private sessions description & image | Services → private | Private sessions page |
| Community description & image | Services → community | Community page |
| Community events | Community Events | Community page (upcoming events list) |
| About Gabrielle (bio, photo, qualifications) | Trainers → Gabrielle | Homepage about section + About page |
| Site settings (contact email, Instagram, footer links) | Site Settings | Footer + contact references (not yet wired — currently hardcoded) |

### What's NOT editable in the CMS (hardcoded)

- Navigation links and menu structure
- Page layouts and section order
- Booking page content (driven by database, not CMS)
- Contact form
- Terms & conditions
- Button text and labels
- Colour palette and fonts

### How publishing works

After clicking "Publish" in Sanity, changes appear on the live site within a few seconds. No deployment or developer action needed.

### Common tasks

Step-by-step instructions for:
- Updating a class description
- Changing a service image (including image sizing recommendations)
- Adding a community event
- Updating bio/qualifications

### Image guidelines

- Recommended dimensions for service images (landscape, ~1200x500)
- Use Sanity's crop/hotspot tool for focal point control
- Supported formats (JPEG, PNG, WebP)

---

## 6. Note on `siteSettings`

The `siteSettings` document type exists in Sanity and is queryable, but no page in the app currently fetches it. The footer, contact email, and Instagram link are hardcoded. This means edits to Site Settings in Sanity won't appear anywhere yet.

The CMS guide will note this explicitly. Wiring up siteSettings is a natural follow-up task but out of scope here.

---

## Out of Scope

- Wiring `siteSettings` to the footer/nav (follow-up task)
- Sanity preview/draft mode
- Tag-based revalidation (path-based is sufficient at this scale)
- New CMS content types

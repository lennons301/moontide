# CMS Revalidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sanity CMS edits appear on the production site within seconds, fix broken image rendering, remove dead schema, and provide a CMS user guide.

**Architecture:** A Sanity webhook POSTs to `/api/revalidate` on publish. The handler verifies a shared secret, maps document types to affected URL paths, and calls `revalidatePath()`. All CMS pages also get 1-hour ISR as a fallback. `next.config.ts` adds `cdn.sanity.io` to image remote patterns. The unused `page` schema is removed. A markdown guide documents the CMS for Gabrielle.

**Tech Stack:** Next.js 16 (App Router), Sanity, `revalidatePath()`, Vitest

**Spec:** `docs/superpowers/specs/2026-04-14-cms-revalidation-design.md`

---

### Task 1: Fix Sanity image rendering

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add remotePatterns for cdn.sanity.io**

Replace the entire contents of `next.config.ts` with:

```typescript
import type { NextConfig } from "next";

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

export default nextConfig;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `just typecheck`

Expected: Clean exit, no errors.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "fix: allow Sanity CDN images in Next.js Image component"
```

---

### Task 2: Add ISR to all CMS-driven pages

**Files:**
- Modify: `src/app/page.tsx:10`
- Modify: `src/app/about/page.tsx`
- Modify: `src/app/classes/[slug]/page.tsx`
- Modify: `src/app/coaching/page.tsx`
- Modify: `src/app/community/page.tsx`
- Modify: `src/app/private/page.tsx`

- [ ] **Step 1: Change homepage revalidate from 60 to 3600**

In `src/app/page.tsx`, change line 10:

```typescript
export const revalidate = 60; // Revalidate CMS content every 60 seconds
```

to:

```typescript
export const revalidate = 3600;
```

- [ ] **Step 2: Add revalidate to about page**

In `src/app/about/page.tsx`, add after the metadata export (after line 9):

```typescript
export const revalidate = 3600;
```

- [ ] **Step 3: Add revalidate to class detail page**

In `src/app/classes/[slug]/page.tsx`, add after the imports (after line 7, before the `knownSlugs` const):

```typescript
export const revalidate = 3600;
```

- [ ] **Step 4: Add revalidate to coaching page**

In `src/app/coaching/page.tsx`, add after the metadata export (after line 11):

```typescript
export const revalidate = 3600;
```

- [ ] **Step 5: Add revalidate to community page**

In `src/app/community/page.tsx`, add after the metadata export (after line 8):

```typescript
export const revalidate = 3600;
```

- [ ] **Step 6: Add revalidate to private page**

In `src/app/private/page.tsx`, add after the metadata export (after line 9):

```typescript
export const revalidate = 3600;
```

- [ ] **Step 7: Verify typecheck passes**

Run: `just typecheck`

Expected: Clean exit, no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/app/about/page.tsx src/app/classes/\[slug\]/page.tsx src/app/coaching/page.tsx src/app/community/page.tsx src/app/private/page.tsx
git commit -m "feat: add ISR (1 hour) to all CMS-driven pages as revalidation fallback"
```

---

### Task 3: Create Sanity revalidation webhook endpoint

**Files:**
- Create: `src/app/api/revalidate/route.ts`
- Create: `tests/api/revalidate.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/api/revalidate.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRevalidatePath = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

// Set env before importing route
vi.stubEnv("SANITY_WEBHOOK_SECRET", "test-secret");

import { POST } from "@/app/api/revalidate/route";

function makeRequest(body: object, secret?: string) {
  return new Request("http://localhost:3000/api/revalidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-sanity-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 if secret is missing", async () => {
    const res = await POST(makeRequest({ _type: "service" }));
    expect(res.status).toBe(401);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns 401 if secret is wrong", async () => {
    const res = await POST(makeRequest({ _type: "service" }, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates service paths when a service is published", async () => {
    const res = await POST(makeRequest({ _type: "service" }, "test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toContain("/");
    expect(json.revalidated).toContain("/classes/prenatal");
    expect(json.revalidated).toContain("/classes/postnatal");
    expect(json.revalidated).toContain("/classes/baby-yoga");
    expect(json.revalidated).toContain("/classes/vinyasa");
    expect(json.revalidated).toContain("/coaching");
    expect(json.revalidated).toContain("/community");
    expect(json.revalidated).toContain("/private");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(8);
  });

  it("revalidates trainer paths when a trainer is published", async () => {
    const res = await POST(makeRequest({ _type: "trainer" }, "test-secret"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toContain("/");
    expect(json.revalidated).toContain("/about");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(2);
  });

  it("revalidates community path when a communityEvent is published", async () => {
    const res = await POST(
      makeRequest({ _type: "communityEvent" }, "test-secret"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toContain("/community");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
  });

  it("revalidates homepage when siteSettings are published", async () => {
    const res = await POST(
      makeRequest({ _type: "siteSettings" }, "test-secret"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.revalidated).toContain("/");
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for unknown document type", async () => {
    const res = await POST(makeRequest({ _type: "unknown" }, "test-secret"));
    expect(res.status).toBe(400);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/revalidate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sanity-webhook-secret": "test-secret",
      },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm run test -- tests/api/revalidate.test.ts`

Expected: FAIL — module `@/app/api/revalidate/route` does not exist.

- [ ] **Step 3: Implement the webhook handler**

Create `src/app/api/revalidate/route.ts`:

```typescript
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

const pathsByType: Record<string, string[]> = {
  service: [
    "/",
    "/classes/prenatal",
    "/classes/postnatal",
    "/classes/baby-yoga",
    "/classes/vinyasa",
    "/coaching",
    "/community",
    "/private",
  ],
  trainer: ["/", "/about"],
  communityEvent: ["/community"],
  siteSettings: ["/"],
};

export async function POST(request: Request) {
  const secret = request.headers.get("x-sanity-webhook-secret");
  if (secret !== process.env.SANITY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { _type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const docType = body._type;
  if (!docType || !(docType in pathsByType)) {
    return NextResponse.json(
      { error: `Unknown document type: ${docType}` },
      { status: 400 },
    );
  }

  const paths = pathsByType[docType];
  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: paths });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm run test -- tests/api/revalidate.test.ts`

Expected: All 7 tests pass.

- [ ] **Step 5: Run full test suite**

Run: `just test`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/revalidate/route.ts tests/api/revalidate.test.ts
git commit -m "feat: add Sanity webhook endpoint for on-demand revalidation"
```

---

### Task 4: Remove unused `page` document type

**Files:**
- Delete: `src/sanity/schema/page.ts`
- Modify: `src/sanity/schema/index.ts`
- Modify: `src/sanity/structure.ts`
- Modify: `src/lib/sanity/queries.ts`
- Modify: `src/lib/sanity/types.ts`

- [ ] **Step 1: Remove page from schema index**

In `src/sanity/schema/index.ts`, change from:

```typescript
import { communityEvent } from "./community-event";
import { page } from "./page";
import { service } from "./service";
import { siteSettings } from "./site-settings";
import { trainer } from "./trainer";

export const schemaTypes = [
  siteSettings,
  page,
  service,
  communityEvent,
  trainer,
];
```

to:

```typescript
import { communityEvent } from "./community-event";
import { service } from "./service";
import { siteSettings } from "./site-settings";
import { trainer } from "./trainer";

export const schemaTypes = [siteSettings, service, communityEvent, trainer];
```

- [ ] **Step 2: Remove page from Studio structure**

In `src/sanity/structure.ts`, change from:

```typescript
import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Site Settings")
        .child(
          S.document().schemaType("siteSettings").documentId("siteSettings"),
        ),
      S.divider(),
      S.documentTypeListItem("service").title("Services"),
      S.documentTypeListItem("page").title("Pages"),
      S.documentTypeListItem("communityEvent").title("Community Events"),
      S.documentTypeListItem("trainer").title("Trainers"),
    ]);
```

to:

```typescript
import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Site Settings")
        .child(
          S.document().schemaType("siteSettings").documentId("siteSettings"),
        ),
      S.divider(),
      S.documentTypeListItem("service").title("Services"),
      S.documentTypeListItem("communityEvent").title("Community Events"),
      S.documentTypeListItem("trainer").title("Trainers"),
    ]);
```

- [ ] **Step 3: Remove pageBySlugQuery from queries**

In `src/lib/sanity/queries.ts`, remove lines 30-36:

```typescript
export const pageBySlugQuery = `*[_type == "page" && slug.current == $slug][0]{
  _id,
  title,
  slug,
  heroImage,
  content
}`;
```

The file should go from `siteSettingsQuery` → `servicesQuery` → `serviceBySlugQuery` → `communityEventsQuery` → `trainerQuery` (no `pageBySlugQuery`).

- [ ] **Step 4: Remove Page interface from types**

In `src/lib/sanity/types.ts`, remove lines 10-16:

```typescript
export interface Page {
  _id: string;
  title: string;
  slug: { current: string };
  heroImage?: Image;
  content?: PortableTextBlock[];
}
```

- [ ] **Step 5: Delete the page schema file**

```bash
rm src/sanity/schema/page.ts
```

- [ ] **Step 6: Verify typecheck passes**

Run: `just typecheck`

Expected: Clean exit. Nothing imports `Page` or `pageBySlugQuery`.

- [ ] **Step 7: Verify tests pass**

Run: `just test`

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git rm src/sanity/schema/page.ts
git add src/sanity/schema/index.ts src/sanity/structure.ts src/lib/sanity/queries.ts src/lib/sanity/types.ts
git commit -m "refactor: remove unused page document type from Sanity schema"
```

---

### Task 5: Add SANITY_WEBHOOK_SECRET to Doppler

This is a manual task — the operator adds the secret to Doppler, which syncs to Vercel automatically via the Doppler-Vercel integration.

- [ ] **Step 1: Generate a secret**

```bash
openssl rand -base64 32
```

Copy the output.

- [ ] **Step 2: Add to Doppler**

In Doppler dashboard → `moontide` project:
1. Add `SANITY_WEBHOOK_SECRET` to `dev` config with the generated value
2. Add `SANITY_WEBHOOK_SECRET` to `stg` config with the same value
3. Add `SANITY_WEBHOOK_SECRET` to `prd` config with the same value

Doppler-Vercel sync will push it to Vercel Preview and Production automatically.

- [ ] **Step 3: Update .env.example**

Add to `.env.example`:

```
SANITY_WEBHOOK_SECRET=
```

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add SANITY_WEBHOOK_SECRET to .env.example"
```

---

### Task 6: Configure Sanity webhook (manual)

This is a manual task performed in the Sanity dashboard after the revalidation endpoint is deployed.

- [ ] **Step 1: Create webhook in Sanity**

In Sanity dashboard (https://www.sanity.io/manage/project/77icfczp) → API → Webhooks → Create Webhook:

- **Name:** Vercel revalidation
- **URL:** `https://moontide-six.vercel.app/api/revalidate`
- **Trigger on:** Create, Update, Delete
- **Filter:** `_type in ["service", "trainer", "communityEvent", "siteSettings"]`
- **Projection:** `{_type, slug}`
- **HTTP method:** POST
- **Secret:** (leave blank — we use a custom header instead)
- **HTTP Headers:** Add header `x-sanity-webhook-secret` with the value of `SANITY_WEBHOOK_SECRET` from Doppler prd config

- [ ] **Step 2: Test the webhook**

Publish a minor edit to any service in Sanity. Check:
1. Webhook delivery log shows 200 response
2. The edited content appears on the production site within a few seconds

---

### Task 7: Write CMS user guide

**Files:**
- Create: `docs/cms-guide.md`

- [ ] **Step 1: Create the guide**

Create `docs/cms-guide.md`:

```markdown
# Moontide CMS Guide

A guide to editing content on the Moontide website using Sanity Studio.

**Sanity Studio URL:** https://moontide-six.vercel.app/studio

---

## How it works

The website pulls text, images, and event details from Sanity. When you publish a change in Sanity, it appears on the live site within a few seconds — no developer action needed.

---

## What you can edit

### Services

Services are the main content type. Each one represents a page on the website.

| Service (in Sanity) | Page on the website |
|---------------------|---------------------|
| prenatal | [/classes/prenatal](https://moontide-six.vercel.app/classes/prenatal) |
| postnatal | [/classes/postnatal](https://moontide-six.vercel.app/classes/postnatal) |
| baby-yoga | [/classes/baby-yoga](https://moontide-six.vercel.app/classes/baby-yoga) |
| vinyasa | [/classes/vinyasa](https://moontide-six.vercel.app/classes/vinyasa) |
| coaching | [/coaching](https://moontide-six.vercel.app/coaching) |
| community | [/community](https://moontide-six.vercel.app/community) |
| private | [/private](https://moontide-six.vercel.app/private) |

**What you can change for each service:**
- **Title** — the heading shown on the page
- **Short description** — shown on the homepage service cards
- **Full description** — the main text on the service's own page (supports rich text: bold, italic, links, lists)
- **Image** — the hero image shown at the top of the service's page and on homepage cards
- **Display order** — controls the order services appear on the homepage (lower number = shown first)

### Trainers (About Gabrielle)

The trainer profile appears on the **homepage** (about section) and the **About page**.

**What you can change:**
- **Name**
- **Bio** — rich text shown on the About page
- **Photo** — shown on the About page
- **Qualifications** — list of year + description, shown on the About page

### Community Events

Events appear on the **Community page** under "Upcoming Dates".

**What you can change:**
- **Title** — event name
- **Date** — when the event takes place
- **Description** — short summary
- **Location** — where it's held

Events are shown in date order (earliest first). Past events remain visible until manually deleted.

### Site Settings

Global settings for the website.

**What you can change:**
- **Contact email**
- **Instagram URL**
- **Footer links**

> **Note:** Site Settings are not currently wired into the website — changes here won't appear yet. This will be connected in a future update.

---

## What you cannot edit in the CMS

These parts of the website are built into the code and need a developer to change:

- Navigation menu links and structure
- Page layouts, section order, and design
- The booking page (driven by the database, not Sanity)
- Contact form
- Terms and conditions page
- Button text and labels
- Colours and fonts

If you need changes to any of these, let Sean know.

---

## Common tasks

### Update a class description

1. Open Sanity Studio
2. Click **Services** in the sidebar
3. Find the class (e.g. "Prenatal Yoga")
4. Edit the **Full description** field (this is what appears on the class's page)
5. Click **Publish**
6. The change appears on the website within a few seconds

### Change a service image

1. Open the service in Sanity Studio
2. Click on the **Image** field
3. Upload a new image or choose from the media library
4. Use the **crop** and **hotspot** tools to set the focal point (the hotspot controls which part of the image stays visible when it's cropped on different screen sizes)
5. Click **Publish**

**Image tips:**
- Landscape orientation works best (the site crops images to wide rectangles)
- Aim for at least 1200px wide for sharp display on large screens
- JPEG, PNG, and WebP are all supported
- File size doesn't matter much — the website automatically optimises images

### Add a community event

1. Open Sanity Studio
2. Click **Community Events** in the sidebar
3. Click the **+** button to create a new event
4. Fill in the title, date, location, and description
5. Click **Publish**
6. The event appears on the Community page within a few seconds

### Update your bio or qualifications

1. Open Sanity Studio
2. Click **Trainers** in the sidebar
3. Click on your trainer profile
4. Edit the **Bio** or **Qualifications** fields
5. Click **Publish**

---

## Troubleshooting

**I published a change but it's not showing on the website**

- Wait 10 seconds and refresh the page — changes usually appear within a few seconds
- Make sure you clicked **Publish**, not just saved a draft (drafts are not shown on the live site)
- If it still hasn't appeared after a minute, the revalidation webhook may have failed — let Sean know

**My image looks cropped strangely**

- Open the image in Sanity and adjust the **hotspot** (the orange circle) — drag it to the most important part of the image
- The website crops images to a wide rectangle, so place the hotspot on the area you want to keep visible
```

- [ ] **Step 2: Commit**

```bash
git add docs/cms-guide.md
git commit -m "docs: add CMS user guide for Sanity content editing"
```

---

### Task 8: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Add revalidation webhook to project structure**

In the `api/` section of the Project Structure, add after the `admin/` block:

```
      revalidate/           # Sanity webhook for on-demand ISR revalidation
```

- [ ] **Step 2: Add revalidation convention to Key Conventions**

Add to the Key Conventions section (after the "Secrets sync" line):

```
- **CMS revalidation:** Sanity webhook POSTs to `/api/revalidate` on publish. Handler verifies `SANITY_WEBHOOK_SECRET` header, maps document types to paths, calls `revalidatePath()`. All CMS pages also have `revalidate = 3600` as a fallback.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md with revalidation webhook and ISR convention"
```

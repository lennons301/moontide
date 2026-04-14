# CMS Editability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage hero tagline, homepage about preview, and About page hero image editable via Sanity CMS.

**Architecture:** Add fields to existing Sanity schemas (siteSettings, trainer), update GROQ query projections and TypeScript types, then wire the data through to the React components. All changes follow the existing pattern of Sanity fetch → fallback if null.

**Tech Stack:** Sanity CMS, Next.js 16, React 19, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-14-cms-editability-design.md`

---

### Task 1: Add heroTagline to siteSettings schema, query, and types

**Files:**
- Modify: `src/sanity/schema/site-settings.ts`
- Modify: `src/lib/sanity/queries.ts`
- Modify: `src/lib/sanity/types.ts`

- [ ] **Step 1: Add heroTagline field to siteSettings schema**

In `src/sanity/schema/site-settings.ts`, add a new field after `contactEmail`:

```typescript
defineField({
  name: "heroTagline",
  title: "Hero Tagline",
  type: "text",
  rows: 4,
  description: "Text shown below the logo on the homepage. Use line breaks to separate lines (e.g. pronunciation on one line, definition on the next).",
}),
```

- [ ] **Step 2: Add heroTagline to siteSettingsQuery projection**

In `src/lib/sanity/queries.ts`, change the `siteSettingsQuery` from:

```
export const siteSettingsQuery = `*[_type == "siteSettings"][0]{
  title,
  contactEmail,
  instagramUrl,
  footerLinks
}`;
```

to:

```
export const siteSettingsQuery = `*[_type == "siteSettings"][0]{
  title,
  heroTagline,
  contactEmail,
  instagramUrl,
  footerLinks
}`;
```

- [ ] **Step 3: Add heroTagline to SiteSettings interface**

In `src/lib/sanity/types.ts`, add to the `SiteSettings` interface:

```typescript
export interface SiteSettings {
  title: string;
  heroTagline?: string;
  contactEmail: string;
  instagramUrl?: string;
  footerLinks?: { label: string; href: string }[];
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `just typecheck`

Expected: Clean exit.

- [ ] **Step 5: Commit**

```bash
git add src/sanity/schema/site-settings.ts src/lib/sanity/queries.ts src/lib/sanity/types.ts
git commit -m "feat: add heroTagline field to siteSettings schema"
```

---

### Task 2: Add shortBio and heroImage to trainer schema, query, and types

**Files:**
- Modify: `src/sanity/schema/trainer.ts`
- Modify: `src/lib/sanity/queries.ts`
- Modify: `src/lib/sanity/types.ts`

- [ ] **Step 1: Add shortBio and heroImage fields to trainer schema**

In `src/sanity/schema/trainer.ts`, add two new fields after `name`:

```typescript
defineField({
  name: "shortBio",
  title: "Short Bio",
  type: "string",
  description: "One-liner shown on the homepage about section (e.g. 'Yoga teacher and transformational coach...')",
}),
defineField({
  name: "heroImage",
  title: "Hero Image",
  type: "image",
  options: { hotspot: true },
  description: "Banner image shown at the top of the About page",
}),
```

- [ ] **Step 2: Add shortBio and heroImage to trainerQuery projection**

In `src/lib/sanity/queries.ts`, change the `trainerQuery` from:

```
export const trainerQuery = `*[_type == "trainer"][0]{
  _id,
  name,
  bio,
  photo,
  qualifications
}`;
```

to:

```
export const trainerQuery = `*[_type == "trainer"][0]{
  _id,
  name,
  shortBio,
  bio,
  photo,
  heroImage,
  qualifications
}`;
```

- [ ] **Step 3: Add shortBio and heroImage to Trainer interface**

In `src/lib/sanity/types.ts`, update the `Trainer` interface:

```typescript
export interface Trainer {
  _id: string;
  name: string;
  shortBio?: string;
  bio?: PortableTextBlock[];
  photo?: Image;
  heroImage?: Image;
  qualifications?: { year: string; description: string }[];
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `just typecheck`

Expected: Clean exit.

- [ ] **Step 5: Commit**

```bash
git add src/sanity/schema/trainer.ts src/lib/sanity/queries.ts src/lib/sanity/types.ts
git commit -m "feat: add shortBio and heroImage fields to trainer schema"
```

---

### Task 3: Wire homepage hero to CMS

**Files:**
- Modify: `src/components/hero.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update Hero component to accept and render tagline prop**

Replace the entire contents of `src/components/hero.tsx` with:

```typescript
import Image from "next/image";
import Link from "next/link";

const fallbackTagline = `moontide
/ˈmuːn.taɪd/ · noun
The pull of the moon on the tides — a reminder that change is natural, cyclical, and part of who we are.`;

interface HeroProps {
  imageUrl?: string;
  tagline?: string;
}

export function Hero({ imageUrl, tagline }: HeroProps) {
  const lines = (tagline || fallbackTagline).split("\n").filter(Boolean);

  return (
    <section className="relative min-h-[70vh] flex items-center justify-center">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt="Moon over water"
          fill
          className="object-cover"
          priority
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-ocean-light-blue via-soft-moonstone/50 to-dawn-light" />
      )}
      <div className="relative z-10 text-center px-6 py-16">
        <Image
          src="/images/moontide-icon.png"
          alt=""
          width={351}
          height={234}
          className="h-24 md:h-32 w-auto mx-auto mb-4"
          priority
        />
        <h1 className="text-4xl md:text-5xl font-light tracking-[0.12em] text-deep-tide-blue mb-4">
          Moontide
        </h1>
        <div className="max-w-md mx-auto mb-8 space-y-1">
          {lines.map((line, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "text-deep-ocean italic"
                  : i === 1
                    ? "text-sm text-deep-ocean"
                    : "text-deep-ocean leading-relaxed"
              }
            >
              {line}
            </p>
          ))}
        </div>
        <div className="flex gap-3 justify-center flex-wrap">
          <Link
            href="/book"
            className="bg-bright-orange text-dawn-light px-6 py-3 rounded-md font-semibold text-sm hover:bg-bright-orange/90 transition-colors"
          >
            Book a Class
          </Link>
          <Link
            href="/about"
            className="border border-deep-tide-blue text-deep-tide-blue px-6 py-3 rounded-md text-sm hover:bg-deep-tide-blue hover:text-dawn-light transition-colors"
          >
            Learn More
          </Link>
        </div>
      </div>
    </section>
  );
}
```

The styling logic: first line is italic (the word "moontide"), second line is small (pronunciation), remaining lines are normal body text (the definition). This matches the current hardcoded layout.

- [ ] **Step 2: Update homepage to fetch siteSettings and pass tagline**

In `src/app/page.tsx`, replace the entire file with:

```typescript
import { AboutPreview } from "@/components/about-preview";
import { BookingOptions } from "@/components/booking-options";
import { ContactForm } from "@/components/contact-form";
import { Hero } from "@/components/hero";
import { ServicesSection } from "@/components/services-section";
import { sanityClient, urlFor } from "@/lib/sanity/client";
import {
  servicesQuery,
  siteSettingsQuery,
  trainerQuery,
} from "@/lib/sanity/queries";
import type { Service, SiteSettings, Trainer } from "@/lib/sanity/types";

export const revalidate = 3600;

export default async function HomePage() {
  const [services, trainer, siteSettings] = await Promise.all([
    sanityClient.fetch<Service[]>(servicesQuery),
    sanityClient.fetch<Trainer | null>(trainerQuery),
    sanityClient.fetch<SiteSettings | null>(siteSettingsQuery),
  ]);

  const photoUrl = trainer?.photo
    ? urlFor(trainer.photo).width(160).height(160).url()
    : undefined;

  return (
    <>
      <Hero tagline={siteSettings?.heroTagline ?? undefined} />
      <BookingOptions />
      <ServicesSection services={services} />
      {trainer && (
        <AboutPreview
          name={trainer.name}
          shortBio={
            trainer.shortBio ??
            "Yoga teacher and transformational coach supporting women through every phase of life."
          }
          photoUrl={photoUrl}
        />
      )}
      <section className="py-16 px-6 bg-dawn-light">
        <div className="max-w-lg mx-auto">
          <h2 className="text-xl font-semibold text-deep-tide-blue text-center mb-1">
            Leave a message
          </h2>
          <div className="w-8 h-0.5 bg-bright-orange mx-auto mb-8" />
          <ContactForm />
        </div>
      </section>
    </>
  );
}
```

Changes from current:
- Imports `siteSettingsQuery`, `SiteSettings`, `urlFor`
- Fetches `siteSettings` in the Promise.all
- Passes `siteSettings.heroTagline` to Hero
- Builds `photoUrl` from `trainer.photo` and passes to AboutPreview
- Uses `trainer.shortBio` with fallback instead of hardcoded string

- [ ] **Step 3: Verify typecheck passes**

Run: `just typecheck`

Expected: Clean exit.

- [ ] **Step 4: Verify tests pass**

Run: `just test`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/hero.tsx src/app/page.tsx
git commit -m "feat: wire homepage hero tagline and about preview to CMS"
```

---

### Task 4: Add hero image to About page

**Files:**
- Modify: `src/app/about/page.tsx`

- [ ] **Step 1: Add hero image section to About page**

In `src/app/about/page.tsx`, add the hero image section. The file currently starts rendering with `{/* Hero */}` which is just a text heading. Add an image hero before it.

Find:

```typescript
  const photoUrl = trainer?.photo
    ? urlFor(trainer.photo).width(320).height(320).url()
    : null;

  return (
    <>
      {/* Hero */}
      <section className="py-16 px-6 bg-dawn-light">
```

Replace with:

```typescript
  const photoUrl = trainer?.photo
    ? urlFor(trainer.photo).width(320).height(320).url()
    : null;

  const heroImageUrl = trainer?.heroImage
    ? urlFor(trainer.heroImage).width(1200).height(500).url()
    : null;

  return (
    <>
      {/* Hero image */}
      <div className="relative h-64 md:h-96 bg-ocean-light-blue/30">
        {heroImageUrl ? (
          <Image
            src={heroImageUrl}
            alt="About Moontide"
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-deep-ocean/40">
            [ Photography — about ]
          </div>
        )}
      </div>

      {/* Hero */}
      <section className="py-16 px-6 bg-dawn-light">
```

- [ ] **Step 2: Verify typecheck passes**

Run: `just typecheck`

Expected: Clean exit.

- [ ] **Step 3: Commit**

```bash
git add src/app/about/page.tsx
git commit -m "feat: add CMS-editable hero image to About page"
```

---

### Task 5: Update CMS guide

**Files:**
- Modify: `docs/cms-guide.md`

- [ ] **Step 1: Update Site Settings section**

In `docs/cms-guide.md`, find the Site Settings section:

```markdown
### Site Settings

Global settings for the website.

**What you can change:**
- **Contact email**
- **Instagram URL**
- **Footer links**

> **Note:** Site Settings are not currently wired into the website — changes here won't appear yet. This will be connected in a future update.
```

Replace with:

```markdown
### Site Settings

Global settings for the website.

**What you can change:**
- **Hero tagline** — the text shown below the Moontide logo on the homepage (the pronunciation and definition). Use line breaks to separate lines: first line appears in italics, second line in small text, remaining lines as normal text.
- **Contact email**
- **Instagram URL**
- **Footer links**

> **Note:** Contact email, Instagram URL, and footer links are not currently wired into the website — changes to these fields won't appear yet. The hero tagline is live.
```

- [ ] **Step 2: Update Trainers section**

Find the Trainers section:

```markdown
**What you can change:**
- **Name**
- **Bio** — rich text shown on the About page
- **Photo** — shown on the About page
- **Qualifications** — list of year + description, shown on the About page
```

Replace with:

```markdown
**What you can change:**
- **Name**
- **Short bio** — one-liner shown on the homepage about section
- **Bio** — rich text shown on the About page
- **Photo** — circular portrait shown on the About page
- **Hero image** — banner image shown at the top of the About page
- **Qualifications** — list of year + description, shown on the About page
```

- [ ] **Step 3: Update "What you cannot edit" section**

In the list of things that cannot be edited, remove "Page layouts, section order, and design" since some layout content is now editable. The line should stay but be reworded. Find:

```markdown
- Navigation menu links and structure
- Page layouts, section order, and design
- The booking page (driven by the database, not Sanity)
```

Replace with:

```markdown
- Navigation menu links and structure
- Page layouts and section order
- The booking page (driven by the database, not Sanity)
```

- [ ] **Step 4: Commit**

```bash
git add docs/cms-guide.md
git commit -m "docs: update CMS guide with new editable fields"
```

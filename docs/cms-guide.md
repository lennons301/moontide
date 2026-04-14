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

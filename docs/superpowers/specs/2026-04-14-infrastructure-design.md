# Infrastructure: CI/CD, Doppler-Vercel Integration, Proxy Migration

**Date:** 2026-04-14
**Status:** Approved
**Scope:** Three infrastructure items to bring Moontide into compliance with platform standards and fix broken preview deployments.

---

## 1. CI/CD — GitHub Actions

### Problem

No CI pipeline exists. PRs can be merged without passing lint, typecheck, or tests. Platform standard (`~/code/platform/choices/ci-cd.md`) requires GitHub Actions gating all merges.

### Design

Create `.github/workflows/ci.yml` following the platform template:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [master]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install mise
        uses: jdx/mise-action@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: just lint

      - name: Type check
        run: just typecheck

      - name: Test
        run: just test
```

**No Doppler secrets in CI.** All tests mock DB and external services, so no environment variables are needed.

**Branch protection (manual step):** After the workflow exists, configure in GitHub repo settings (Settings > Branches > Add rule for `master`):
- Require pull request before merging
- Require status checks to pass (select `ci` job)
- Do not allow bypassing

### Verification

- Push a branch with the workflow, open a PR, confirm the `ci` job runs and passes.

---

## 2. Vercel Preview Env Vars — Doppler Integration

### Problem

Preview deployments fail because environment variables (DATABASE_URL, RESEND_API_KEY, BETTER_AUTH_SECRET, BETTER_AUTH_URL, CONTACT_EMAIL, SANITY_API_TOKEN, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) are only set for the Production environment in Vercel.

### Design

Install the Doppler-Vercel integration to auto-sync secrets from Doppler to Vercel environments. This is a dashboard task, not a code change.

**Steps:**

1. In Doppler dashboard, go to Integrations > Add Integration > Vercel
2. Authorise Doppler to access the Vercel account
3. Create sync mappings:
   - Doppler project `moontide`, config `prd` → Vercel environment `Production`
   - Doppler project `moontide`, config `stg` → Vercel environment `Preview`
4. Trigger initial sync
5. Remove any manually-set env vars from the Vercel dashboard that are now managed by Doppler (to avoid conflicts)
6. Trigger a preview deployment and confirm it builds and runs successfully

**Note on `dev` config:** The Doppler `dev` config points at local Docker Postgres, so it should NOT be synced to any Vercel environment.

### Verification

- Open a PR after this is configured. Confirm the Vercel preview deployment builds and the site loads correctly at the preview URL.

---

## 3. Middleware to Proxy Migration

### Problem

`src/middleware.ts` uses the deprecated Next.js middleware convention. Next.js 16 renamed this to `proxy.ts` with the exported function renamed from `middleware()` to `proxy()`. The current code works but logs a deprecation warning.

### Current code (`src/middleware.ts`)

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/admin/login")
  ) {
    const token = request.cookies.get("better-auth.session_token");
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

### Design

Two changes:
1. Rename `src/middleware.ts` → `src/proxy.ts`
2. Rename the exported function `middleware` → `proxy`

The `config` export with `matcher` is unchanged — the proxy convention uses the same format.

### Migrated code (`src/proxy.ts`)

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith("/admin") &&
    !request.nextUrl.pathname.startsWith("/admin/login")
  ) {
    const token = request.cookies.get("better-auth.session_token");
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

### Verification

- Run `just dev`, navigate to `/admin` without being logged in, confirm redirect to `/admin/login`.
- Confirm no deprecation warning in dev server output.

---

## Out of Scope

- Sentry observability (Phase 3)
- Stripe account setup (Payments phase)
- Architecture diagrams
- Calendar booking UI redesign

## AGENTS.md Update

After implementation, update AGENTS.md to:
- Change `src/middleware.ts` reference to `src/proxy.ts` in the project structure
- Note CI/CD is active (GitHub Actions)
- Note secrets are synced via Doppler-Vercel integration

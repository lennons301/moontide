# Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CI/CD pipeline, configure Doppler-Vercel secret sync, and migrate deprecated middleware to Next.js 16 proxy convention.

**Architecture:** Three independent infrastructure changes. CI/CD is a new GitHub Actions workflow. Doppler-Vercel is a dashboard configuration (documented steps for the operator). Proxy migration is a file rename with a function rename. All three can be done in any order.

**Tech Stack:** GitHub Actions, mise, pnpm, Biome, Vitest, Doppler, Vercel, Next.js 16

**Spec:** `docs/superpowers/specs/2026-04-14-infrastructure-design.md`

---

### Task 1: Create CI/CD workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the workflow file**

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

- [ ] **Step 2: Verify the workflow YAML is valid**

Run: `pnpm dlx yaml-lint .github/workflows/ci.yml` or manually confirm the YAML parses cleanly:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for lint, typecheck, test"
```

---

### Task 2: Doppler-Vercel integration (manual dashboard steps)

This task is not code — it's a set of steps the operator performs in the Doppler and Vercel dashboards. Document completion by checking off each step.

- [ ] **Step 1: Install Doppler-Vercel integration**

In Doppler dashboard (https://dashboard.doppler.com):
1. Navigate to the `moontide` project
2. Go to **Integrations** in the left sidebar
3. Click **Add Integration** > **Vercel**
4. Authorise Doppler to access the Vercel account
5. Confirm the integration appears in the integrations list

- [ ] **Step 2: Create sync — Production**

In the Doppler integration settings:
1. Click **Add Sync**
2. Doppler project: `moontide`, config: `prd`
3. Vercel project: `moontide`, environment: `Production`
4. Save and trigger initial sync

- [ ] **Step 3: Create sync — Preview**

In the Doppler integration settings:
1. Click **Add Sync**
2. Doppler project: `moontide`, config: `stg`
3. Vercel project: `moontide`, environment: `Preview`
4. Save and trigger initial sync

- [ ] **Step 4: Remove manually-set Vercel env vars**

In Vercel dashboard (https://vercel.com) > moontide project > Settings > Environment Variables:
1. Review all env vars
2. Remove any that are now synced from Doppler (to avoid conflicts)
3. Keep any Vercel-specific vars that aren't in Doppler (e.g., `VERCEL_URL`)

- [ ] **Step 5: Verify preview deployment works**

Open a PR (the CI workflow PR from Task 1 works for this). Confirm:
1. Vercel preview deployment builds successfully
2. The preview URL loads the site
3. No missing environment variable errors in the Vercel build log

---

### Task 3: Migrate middleware.ts to proxy.ts

**Files:**
- Delete: `src/middleware.ts`
- Create: `src/proxy.ts`

- [ ] **Step 1: Create src/proxy.ts with the renamed function**

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

- [ ] **Step 2: Delete the old middleware.ts**

```bash
rm src/middleware.ts
```

- [ ] **Step 3: Verify typecheck passes**

Run: `just typecheck`

Expected: Clean exit, no errors.

- [ ] **Step 4: Verify lint passes**

Run: `just lint`

Expected: Clean exit, no errors.

- [ ] **Step 5: Verify tests pass**

Run: `just test`

Expected: All existing tests pass. (No test references `middleware.ts` directly — tests mock route handlers, not the proxy layer.)

- [ ] **Step 6: Commit**

```bash
git add src/proxy.ts
git rm src/middleware.ts
git commit -m "refactor: migrate middleware.ts to proxy.ts (Next.js 16 convention)"
```

---

### Task 4: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update project structure — rename middleware.ts to proxy.ts**

In the Project Structure section, change:

```
  middleware.ts             # Admin route protection (/admin/* except /admin/login)
```

to:

```
  proxy.ts                  # Admin route protection (/admin/* except /admin/login)
```

- [ ] **Step 2: Update Key Conventions — auth reference**

Change:

```
- **Auth:** Better Auth protects `/admin/*` routes via middleware. Login at `/admin/login`.
```

to:

```
- **Auth:** Better Auth protects `/admin/*` routes via proxy. Login at `/admin/login`.
```

- [ ] **Step 3: Update Key Conventions — admin APIs reference**

Change:

```
- **Admin APIs:** Routes at `/api/admin/*` — not separately auth-protected (rely on middleware for page access).
```

to:

```
- **Admin APIs:** Routes at `/api/admin/*` — not separately auth-protected (rely on proxy for page access).
```

- [ ] **Step 4: Add CI/CD and secrets sync to Key Conventions**

Add these two lines to the end of the Key Conventions section:

```
- **CI/CD:** GitHub Actions runs lint, typecheck, and test on PRs and pushes to master. No secrets needed in CI — all tests use mocks.
- **Secrets sync:** Doppler-Vercel integration auto-syncs secrets. Doppler `prd` → Vercel Production, Doppler `stg` → Vercel Preview. Never manually set env vars in Vercel that Doppler manages.
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for proxy migration, CI/CD, and Doppler-Vercel sync"
```

---

### Task 5: Branch protection (manual GitHub step)

This is a manual step performed after the CI workflow has run at least once on a PR.

- [ ] **Step 1: Configure branch protection**

In GitHub repo settings (https://github.com/lennons301/moontide/settings/branches):
1. Click **Add rule** (or **Add branch ruleset**)
2. Branch name pattern: `master`
3. Enable: **Require a pull request before merging**
4. Enable: **Require status checks to pass before merging**
5. Search for and select the `ci` status check
6. Enable: **Do not allow bypassing the above settings**
7. Save

- [ ] **Step 2: Verify protection is active**

Try pushing directly to master — it should be blocked. (Or confirm the rule shows as active in the settings UI.)

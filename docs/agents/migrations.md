# Renumbering a Migration

Two branches each add a migration in the same numbered slot. Resolving that collision by **regenerating** the losing migration breaks every database that already applied it.

Drizzle's migrator selects work by the journal timestamp — not by filename, not by hash:

```js
// drizzle-orm/pg-core/dialect.js
if (!lastDbMigration || Number(lastDbMigration.created_at) < migration.folderMillis) {
  /* apply */
}
```

So a migration that is renumbered **and re-stamped with a newer `when`** reads as unapplied and runs a second time.

## The rule

**Renaming the file is safe. Changing its `when` in `drizzle/migrations/meta/_journal.json` is not.** Preserve the original timestamp — rename the `.sql` file and the entry's `tag`, reorder the entries, leave `when` alone.

The preserved timestamp has to satisfy both ends at once:

- **Greater than** the `when` of the migration that now precedes it, or drizzle skips it.
- **Equal to** whatever a database that already ran it recorded in `drizzle.__drizzle_migrations.created_at`, or that database runs it again.

If the original value cannot satisfy both, stop and ask a human — the two constraints pull against each other and the wrong pick is silent.

## The quiet failure

Stamping a migration *earlier* than the entry before it does not error. Drizzle compares against the **last** applied migration only, so on any database already past that point the migration is skipped **forever**: no exception, no missing-column error until some later read fails in production. It is worse than the loud re-run, and nothing in CI or the deploy log will say so.

The same trap catches a migration you are generating fresh: `drizzle-kit generate` stamps the current clock, which is not automatically greater than the entry before it if that one was hand-stamped ahead of the clock. Compare the new entry against its predecessor and raise its `when` above it when it is not already.

## "Unmerged" does not mean "unapplied"

A **preview deploy of this same branch** already ran `drizzle-kit migrate` against the shared stg database — the build command is `drizzle-kit migrate && next build`, so every preview push migrates stg. A migration that has never been merged to master may therefore already be recorded in stg, at the timestamp it carried at that moment. Read `drizzle.__drizzle_migrations` before assuming a migration is unapplied anywhere.

## Worked example: PR #40

The bundle-eligible migration was applied to stg as `0008` with `created_at=1786479960508`. Merging renumbered it to `0009` and re-stamped it `when=1786481764114`; the redeploy re-ran `ADD COLUMN` against a column that already existed and died on Postgres `42701`.

Keeping the original `1786479960508` would have satisfied both constraints — it sorts after master's `0008_rename_vinyasa_class_title` (`1786478966000`), so production would still have applied it, and it matches stg's record, so stg would have skipped it.

## Defence in depth

Write the DDL idempotently regardless — `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and the constraint recipe under **Migrations must be re-runnable** in `AGENTS.md`. CI replays this branch's migrations for exactly this reason; a re-runnable migration turns a re-stamp into a no-op instead of a dead deploy.

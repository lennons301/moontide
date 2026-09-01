#!/usr/bin/env node
// Make the migrations this branch adds look unapplied, without undoing what
// they did, so the next `drizzle-kit migrate` runs their DDL a second time
// against a database that already carries it.
//
// That is the shape of the deploy failure in #40. Drizzle selects work by the
// journal's `when` timestamp, not by filename or hash, so a migration that is
// renumbered — or re-stamped while resolving a merge conflict — reads as
// unapplied on a database a preview deploy already migrated. Re-running its
// DDL is then the deploy's first act, and it dies on an already-existing
// column. New migrations in this repo are written idempotently for exactly
// this reason; this is the check that says so.
//
// Only migrations absent from the base commit's journal are forgotten, so the
// older non-idempotent migrations are never replayed.

import { readFile } from "node:fs/promises";
import postgres from "postgres";

const [baseJournalPath] = process.argv.slice(2);

if (!baseJournalPath) {
  console.error("usage: forget-new-migrations.mjs <base-journal.json>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const readJournal = async (path) => {
  try {
    return JSON.parse(await readFile(path, "utf8")).entries ?? [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
};

const baseEntries = await readJournal(baseJournalPath);
const currentEntries = await readJournal(
  "drizzle/migrations/meta/_journal.json",
);

const baseTags = new Set(baseEntries.map((entry) => entry.tag));
const added = currentEntries.filter((entry) => !baseTags.has(entry.tag));

if (added.length === 0) {
  console.log("No migrations added on this branch — nothing to replay.");
  process.exit(0);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

try {
  // created_at is a bigint holding the journal's `when`; compared as text so
  // the timestamps survive the round trip through JavaScript numbers.
  const forgotten = await sql`
    DELETE FROM drizzle.__drizzle_migrations
    WHERE created_at::text = ANY(${added.map((entry) => String(entry.when))})
    RETURNING created_at
  `;

  for (const entry of added) {
    console.log(`Will replay ${entry.tag} (when=${entry.when})`);
  }

  if (forgotten.length !== added.length) {
    console.error(
      `Expected to forget ${added.length} migration(s), forgot ${forgotten.length}.`,
    );
    process.exit(1);
  }
} finally {
  await sql.end();
}

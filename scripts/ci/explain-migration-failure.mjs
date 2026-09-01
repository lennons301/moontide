#!/usr/bin/env node
// Say why `drizzle-kit migrate` failed, then fail.
//
// drizzle-kit exits 1 and prints nothing but its spinner when a migration
// errors, which in CI is a red cross with no reason attached. This replays the
// pending migrations statement by statement in a transaction it always rolls
// back, so the first statement to fail can be reported with the error
// Postgres gave for it.
//
// Only ever run as the failure branch of `db:migrate`. It exits non-zero
// whatever it finds: if the replay cannot reproduce the failure, the migrate
// step still failed and CI should still be red.

import { readFile } from "node:fs/promises";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const journal = JSON.parse(
  await readFile("drizzle/migrations/meta/_journal.json", "utf8"),
);

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

const report = (tag, statement, error) => {
  console.error(`\n${"-".repeat(72)}`);
  console.error(`Migration ${tag} failed on this statement:\n`);
  console.error(statement.trim());
  console.error(`\n${error.code ?? "?"}: ${error.message}`);
  if (error.detail) console.error(`detail: ${error.detail}`);
  if (error.hint) console.error(`hint: ${error.hint}`);
  console.error(`${"-".repeat(72)}\n`);
};

try {
  const applied = await sql`
    SELECT created_at::text AS created_at FROM drizzle.__drizzle_migrations
  `.catch(() => []);
  const appliedStamps = new Set(applied.map((row) => row.created_at));
  const pending = journal.entries.filter(
    (entry) => !appliedStamps.has(String(entry.when)),
  );

  if (pending.length === 0) {
    console.error(
      "No pending migrations — drizzle-kit failed for some other reason.",
    );
    process.exit(1);
  }

  console.error(
    `Replaying ${pending.length} pending migration(s): ${pending
      .map((entry) => entry.tag)
      .join(", ")}`,
  );

  let explained = false;

  await sql
    .begin(async (tx) => {
      for (const entry of pending) {
        const path = `drizzle/migrations/${entry.tag}.sql`;
        const statements = (await readFile(path, "utf8")).split(
          "--> statement-breakpoint",
        );

        for (const statement of statements) {
          if (statement.trim() === "") continue;
          try {
            await tx.unsafe(statement);
          } catch (error) {
            report(entry.tag, statement, error);
            explained = true;
            throw error;
          }
        }
      }
      // Never commit: this only ever runs to explain a failure.
      throw new Error("rollback");
    })
    .catch(() => {});

  if (!explained) {
    console.error(
      "The pending migrations replayed cleanly — drizzle-kit failed for some other reason.",
    );
  }
} finally {
  await sql.end();
}

process.exit(1);

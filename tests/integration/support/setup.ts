import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { db } from "@/lib/db";

/**
 * Isolation between integration tests: every table is emptied before each one,
 * so a test never sees what the test before it wrote and a run never depends on
 * the run before it — including a run that crashed half way through.
 *
 * Emptying rather than rolling a transaction back, because the code under test
 * uses the `db` singleton and opens its own transactions: a transaction wrapped
 * around the test would either be invisible to it or nest inside it.
 *
 * `RESTART IDENTITY` so serial ids start from 1 in every test, and `CASCADE`
 * because the tables reference each other. The migrations table is in the
 * `drizzle` schema, so it is not in this list and the schema stays migrated.
 */

let publicTables: string[] | null = null;

async function tablesToEmpty(): Promise<string[]> {
  if (publicTables === null) {
    const rows = await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    publicTables = Array.from(rows).map((row) => `"public"."${row.tablename}"`);
  }
  return publicTables;
}

beforeEach(async () => {
  const tables = await tablesToEmpty();
  if (tables.length === 0) return;
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`),
  );
});

// Without this the pooled connections keep the worker process alive.
afterAll(async () => {
  await db.$client.end();
});

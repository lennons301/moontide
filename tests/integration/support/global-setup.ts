import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  integrationDatabaseName,
  integrationDatabaseUrl,
  maintenanceDatabaseUrl,
  serverAddress,
} from "./database-url";

/**
 * Build the database the integration project runs against, once per run:
 * dropped, recreated, migrated from scratch. Every run therefore starts from
 * the schema the migrations produce — a migration that cannot apply fails the
 * test run, and nothing survives from the run before.
 */
export default async function setup() {
  await withMaintenanceConnection(async (admin) => {
    // FORCE: a connection left open by a killed previous run would otherwise
    // hold the database and make the drop fail.
    await admin.unsafe(
      `DROP DATABASE IF EXISTS "${integrationDatabaseName}" WITH (FORCE)`,
    );
    await admin.unsafe(`CREATE DATABASE "${integrationDatabaseName}"`);
  });

  const client = postgres(integrationDatabaseUrl(), { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle/migrations" });
  } finally {
    await client.end();
  }
}

async function withMaintenanceConnection(
  work: (admin: postgres.Sql) => Promise<void>,
) {
  const admin = postgres(maintenanceDatabaseUrl(), { max: 1 });
  try {
    await work(admin);
  } catch (error) {
    throw new Error(unreachableMessage(error), { cause: error });
  } finally {
    await admin.end();
  }
}

function unreachableMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return [
    `Could not prepare the integration database on ${serverAddress()}: ${detail}`,
    "Integration tests need a real Postgres. Start the local one with `docker compose up -d`,",
    "or set TEST_DATABASE_URL to another throwaway server.",
  ].join("\n");
}

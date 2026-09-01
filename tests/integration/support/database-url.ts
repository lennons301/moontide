/**
 * Where the integration tests find a Postgres.
 *
 * Deliberately not `DATABASE_URL`: that points at whatever the developer's
 * Doppler config says — possibly a Neon branch — and this harness drops and
 * recreates the database it runs against. The default is the local Docker
 * Postgres from `docker-compose.yml`, whose password protects nothing, so no
 * credentials are needed anywhere: the same default reaches CI's ephemeral
 * service container. Point `TEST_DATABASE_URL` at another *throwaway* server
 * to override it.
 */

const DEFAULT_SERVER_URL =
  "postgresql://postgres:postgres@localhost:5432/postgres";

/** Its own database, so a test run never touches the dev one. */
export const integrationDatabaseName = "moontide_integration";

/** The database CREATE/DROP is issued against — never the one being replaced. */
const MAINTENANCE_DATABASE = "postgres";

function serverUrl(): URL {
  return new URL(process.env.TEST_DATABASE_URL ?? DEFAULT_SERVER_URL);
}

function urlForDatabase(name: string): string {
  const url = serverUrl();
  url.pathname = `/${name}`;
  return url.toString();
}

export function maintenanceDatabaseUrl(): string {
  return urlForDatabase(MAINTENANCE_DATABASE);
}

export function integrationDatabaseUrl(): string {
  return urlForDatabase(integrationDatabaseName);
}

/** `host:port`, for the message shown when nothing is listening there. */
export function serverAddress(): string {
  const url = serverUrl();
  return `${url.hostname}:${url.port || "5432"}`;
}

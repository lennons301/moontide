#!/usr/bin/env node
// Run a .sql file against DATABASE_URL.
//
// Plain .mjs on purpose: CI needs this before anything is compiled, the repo
// has no TypeScript runner installed, and psql is not a dependency of this
// project. postgres.js already ships as an app dependency.

import { readFile } from "node:fs/promises";
import postgres from "postgres";

const [file] = process.argv.slice(2);

if (!file) {
  console.error("usage: run-sql.mjs <file.sql>");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const contents = await readFile(file, "utf8");
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

try {
  // Simple protocol: the file holds many statements, sent as one batch.
  await sql.unsafe(contents).simple();
  console.log(`Applied ${file}`);
} finally {
  await sql.end();
}

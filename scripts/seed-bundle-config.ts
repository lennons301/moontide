import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { bundleConfig } from "../src/lib/db/schema";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function seed() {
  console.log("Seeding bundle config...");

  await db
    .insert(bundleConfig)
    .values({
      name: "6-Class Bundle",
      priceInPence: 6600,
      credits: 6,
      expiryDays: 90,
    })
    .onConflictDoNothing();

  console.log("  - 6-Class Bundle (£66.00, 6 credits, 90 days)");
  console.log("\nBundle config seeded");
  process.exit(0);
}

seed().catch(console.error);

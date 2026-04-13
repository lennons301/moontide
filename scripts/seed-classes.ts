import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { classes } from "../src/lib/db/schema";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client);

async function seed() {
  console.log("Seeding class types...");
  const classTypes = [
    {
      slug: "prenatal",
      title: "Prenatal Yoga",
      category: "class" as const,
      bookingType: "stripe" as const,
      priceInPence: 1500,
    },
    {
      slug: "postnatal",
      title: "Postnatal Yoga",
      category: "class" as const,
      bookingType: "stripe" as const,
      priceInPence: 1500,
    },
    {
      slug: "baby-yoga",
      title: "Baby Yoga & Massage",
      category: "class" as const,
      bookingType: "stripe" as const,
      priceInPence: 1500,
    },
    {
      slug: "vinyasa",
      title: "Vinyasa Yoga Seasonal Flow",
      category: "class" as const,
      bookingType: "stripe" as const,
      priceInPence: 1500,
    },
  ];

  for (const ct of classTypes) {
    await db.insert(classes).values(ct).onConflictDoNothing();
    console.log(`  - ${ct.title} (${(ct.priceInPence / 100).toFixed(2)})`);
  }

  console.log("\nClass types seeded");
  process.exit(0);
}

seed().catch(console.error);

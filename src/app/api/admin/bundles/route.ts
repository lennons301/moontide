import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bundles } from "@/lib/db/schema";

export async function GET() {
  const result = await db
    .select()
    .from(bundles)
    .orderBy(desc(bundles.purchasedAt));
  return NextResponse.json(result);
}

import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bundles } from "@/lib/db/schema";
import { withAdmin } from "../_lib";

export const GET = withAdmin({}, async () => {
  const result = await db
    .select()
    .from(bundles)
    .orderBy(desc(bundles.purchasedAt));
  return NextResponse.json(result);
});

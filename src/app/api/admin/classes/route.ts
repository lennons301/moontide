import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classes } from "@/lib/db/schema";
import { withAdmin } from "../_lib";

export const GET = withAdmin({}, async () => {
  const result = await db
    .select()
    .from(classes)
    .where(eq(classes.active, true));
  return NextResponse.json(result);
});

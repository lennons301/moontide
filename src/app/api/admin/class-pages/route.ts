import { NextResponse } from "next/server";
import { getClassPageOptions } from "@/lib/content/services";
import { withAdmin } from "../_lib";

/**
 * Every Sanity class document, for the "Page content" dropdown on
 * `/admin/classes` — a `"use client"` page cannot read the CMS for itself.
 * Read-only: this never writes to Sanity, only to `classes.sanityId`.
 */
export const GET = withAdmin({}, async () => {
  const options = await getClassPageOptions();
  return NextResponse.json(options);
});

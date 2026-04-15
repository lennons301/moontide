import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bundleConfig } from "@/lib/db/schema";
import { BundleForm } from "./bundle-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Purchase Bundle — Moontide" };

export default async function BookBundlePage() {
  const activeBundles = await db
    .select()
    .from(bundleConfig)
    .where(eq(bundleConfig.active, true));

  const config = activeBundles[0];
  if (!config) {
    redirect("/book");
  }

  return <BundleForm bundleConfig={config} />;
}

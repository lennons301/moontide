import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { bundleConfig } from "@/lib/db/schema";
import { BundleForm } from "./bundle-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Purchase Bundle — Moontide" };

export default async function BookBundlePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const bundleConfigId = Number.parseInt(id ?? "", 10);

  const config = Number.isFinite(bundleConfigId)
    ? (
        await db
          .select()
          .from(bundleConfig)
          .where(
            and(
              eq(bundleConfig.id, bundleConfigId),
              eq(bundleConfig.active, true),
            ),
          )
      )[0]
    : undefined;

  if (!config) {
    redirect("/book");
  }

  return <BundleForm bundleConfig={config} />;
}

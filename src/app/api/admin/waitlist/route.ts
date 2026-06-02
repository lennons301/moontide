import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { waitlistEntries } from "@/lib/db/schema";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("scheduleId");
  const scheduleId = raw ? Number(raw) : NaN;

  if (!raw || Number.isNaN(scheduleId)) {
    return NextResponse.json({ error: "Missing scheduleId" }, { status: 400 });
  }

  const entries = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.scheduleId, scheduleId))
    .orderBy(asc(waitlistEntries.createdAt));

  return NextResponse.json(entries);
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("id");
  const id = raw ? Number(raw) : NaN;

  if (!raw || Number.isNaN(id)) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const removed = await db
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .returning();

  if (removed.length === 0) {
    return NextResponse.json(
      { error: "Waitlist entry not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ deleted: true });
}

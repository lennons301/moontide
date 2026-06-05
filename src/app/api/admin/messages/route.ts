import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";

export async function GET() {
  const result = await db
    .select()
    .from(contactSubmissions)
    .orderBy(desc(contactSubmissions.createdAt));
  return NextResponse.json(result);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { id, read } = body as { id?: unknown; read?: boolean };

  const numericId = typeof id === "number" ? id : NaN;
  if (!numericId || Number.isNaN(numericId)) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const updated = await db
    .update(contactSubmissions)
    .set({ read: read === true })
    .where(eq(contactSubmissions.id, numericId))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  return NextResponse.json(updated[0]);
}

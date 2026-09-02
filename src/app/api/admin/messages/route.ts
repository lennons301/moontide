import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";
import { ApiError, withAdmin } from "../_lib";

export const GET = withAdmin({}, async () => {
  const result = await db
    .select()
    .from(contactSubmissions)
    .orderBy(desc(contactSubmissions.createdAt));
  return NextResponse.json(result);
});

const markReadBody = z.object({
  id: z
    .number({ error: "Missing id" })
    .int({ error: "Missing id" })
    .positive({ error: "Missing id" }),
  read: z.boolean({ error: "Read must be true or false" }).optional(),
});

export const PUT = withAdmin({ body: markReadBody }, async ({ body }) => {
  const updated = await db
    .update(contactSubmissions)
    .set({ read: body.read === true })
    .where(eq(contactSubmissions.id, body.id))
    .returning();

  if (updated.length === 0) {
    throw new ApiError(404, "Message not found");
  }

  return NextResponse.json(updated[0]);
});

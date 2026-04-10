import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { contactSubmissions } from "@/lib/db/schema";
import { sendContactEmail } from "@/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, subject, message } = body;

  if (!name || !email || !subject || !message) {
    return NextResponse.json(
      { error: "All fields are required" },
      { status: 400 },
    );
  }

  await db.insert(contactSubmissions).values({ name, email, subject, message });

  try {
    await sendContactEmail({ name, email, subject, message });
  } catch {
    // Email forwarding failure is non-critical — submission is already saved in DB
  }

  return NextResponse.json({ success: true });
}

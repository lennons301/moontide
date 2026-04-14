import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

const pathsByType: Record<string, string[]> = {
  service: [
    "/",
    "/classes/prenatal",
    "/classes/postnatal",
    "/classes/baby-yoga",
    "/classes/vinyasa",
    "/coaching",
    "/community",
    "/private",
  ],
  trainer: ["/", "/about"],
  communityEvent: ["/community"],
  siteSettings: ["/"],
};

export async function POST(request: Request) {
  const secret = request.headers.get("x-sanity-webhook-secret");
  if (secret !== process.env.SANITY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { _type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const docType = body._type;
  if (!docType || !(docType in pathsByType)) {
    return NextResponse.json(
      { error: `Unknown document type: ${docType}` },
      { status: 400 },
    );
  }

  const paths = pathsByType[docType];
  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: paths });
}

import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getServicePagePaths } from "@/lib/content/services";

const staticPathsByType: Record<string, string[]> = {
  trainer: ["/", "/about"],
  communityEvent: ["/community"],
  siteSettings: ["/"],
};

/**
 * `service` is the one type whose paths aren't fixed: a class's path comes
 * from the catalogue, so a class added since the last deploy is revalidated
 * correctly without a code change here.
 */
async function pathsForType(docType: string): Promise<string[] | undefined> {
  if (docType === "service") {
    return getServicePagePaths();
  }
  return staticPathsByType[docType];
}

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
  const paths = docType ? await pathsForType(docType) : undefined;
  if (!paths) {
    return NextResponse.json(
      { error: `Unknown document type: ${docType}` },
      { status: 400 },
    );
  }

  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({ revalidated: paths });
}

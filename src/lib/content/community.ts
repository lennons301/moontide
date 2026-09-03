import { communityEventsQuery } from "@/lib/sanity/queries";
import type { CommunityEvent } from "@/lib/sanity/types";
import { fetchOrNull } from "./source";

/**
 * The upcoming community gatherings, soonest first.
 *
 * There is nothing to fall back to — a gathering nobody has published is a
 * gathering that is not happening — so an unreachable CMS answers with no
 * dates, which is what `/community` renders when there are none.
 */
export async function getCommunityEvents(): Promise<CommunityEvent[]> {
  return (await fetchOrNull<CommunityEvent[]>(communityEventsQuery)) ?? [];
}

import { siteSettingsQuery } from "@/lib/sanity/queries";
import type { SiteSettings } from "@/lib/sanity/types";
import { fetchOrNull } from "./source";

/**
 * The site-wide settings anything outside a page body reads. Both fields are
 * optional in the CMS as well as absent during an outage, so a reader that
 * handles "not set" already handles "not reachable".
 */
export interface SiteSettingsContent {
  /** Undefined leaves the Hero on its own hardcoded tagline. */
  heroTagline: string | undefined;
  /** Undefined leaves the footer without its Instagram link. */
  instagramUrl: string | undefined;
}

/**
 * Read by the root layout, which wraps every route — including `/book`, which
 * has no CMS dependency of its own and must keep taking bookings through an
 * outage. The only thing at stake is the footer's Instagram link.
 */
export async function getSiteSettings(): Promise<SiteSettingsContent> {
  const settings = await fetchOrNull<SiteSettings>(siteSettingsQuery);

  return {
    heroTagline: settings?.heroTagline,
    instagramUrl: settings?.instagramUrl,
  };
}

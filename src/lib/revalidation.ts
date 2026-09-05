/**
 * The public routes that show a class's title, description or price. Shared
 * by the Sanity revalidation webhook (`/api/revalidate`, on a `service`
 * document publish) and the admin classes API (on a create, update or
 * deactivate) — both are "a class changed", and neither waits on the hour-long
 * ISR window for it to reach the site.
 */
export const SERVICE_PAGE_PATHS = [
  "/",
  "/classes/prenatal",
  "/classes/postnatal",
  "/classes/baby-yoga",
  "/classes/vinyasa",
  "/coaching",
  "/community",
  "/private",
];

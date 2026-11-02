export const siteSettingsQuery = `*[_type == "siteSettings"][0]{
  title,
  heroTagline,
  contactEmail,
  instagramUrl,
  footerLinks
}`;

export const servicesQuery = `*[_type == "service"] | order(displayOrder asc){
  _id,
  title,
  slug,
  shortDescription,
  image,
  category,
  bookingType,
  displayOrder
}`;

export const serviceBySlugQuery = `*[_type == "service" && slug.current == $slug][0]{
  _id,
  title,
  slug,
  shortDescription,
  fullDescription,
  image,
  category,
  bookingType
}`;

/**
 * A class's content, addressed by `classes.sanityId` rather than by slug —
 * the join that doesn't drift when either side is renamed. `getService`
 * uses this for every catalogue class; `serviceBySlugQuery` remains for the
 * three non-class pages, which have no Postgres row to carry an id.
 */
export const serviceByIdQuery = `*[_type == "service" && _id == $id][0]{
  _id,
  title,
  slug,
  shortDescription,
  fullDescription,
  image,
  category,
  bookingType
}`;

/**
 * The options for the admin "Page content" dropdown: every class document,
 * named so Gabrielle can pick one by title rather than by `_id`.
 */
export const classPageOptionsQuery = `*[_type == "service" && category == "class"] | order(title asc){
  _id,
  title
}`;

export const communityEventsQuery = `*[_type == "communityEvent"] | order(date asc){
  _id,
  title,
  date,
  description,
  location
}`;

export const trainerQuery = `*[_type == "trainer"][0]{
  _id,
  name,
  shortBio,
  bio,
  photo,
  heroImage,
  qualifications
}`;

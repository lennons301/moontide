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
  bio,
  photo,
  qualifications
}`;

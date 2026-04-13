import type { Image, PortableTextBlock } from "sanity";

export interface SiteSettings {
  title: string;
  contactEmail: string;
  instagramUrl?: string;
  footerLinks?: { label: string; href: string }[];
}

export interface Page {
  _id: string;
  title: string;
  slug: { current: string };
  heroImage?: Image;
  content?: PortableTextBlock[];
}

export interface Service {
  _id: string;
  title: string;
  slug: { current: string };
  shortDescription?: string;
  fullDescription?: PortableTextBlock[];
  image?: Image;
  category: "class" | "coaching" | "community" | "private";
  bookingType: "stripe" | "contact" | "info";
  displayOrder?: number;
}

export interface CommunityEvent {
  _id: string;
  title: string;
  date?: string;
  description?: string;
  location?: string;
}

export interface Trainer {
  _id: string;
  name: string;
  bio?: PortableTextBlock[];
  photo?: Image;
  qualifications?: { year: string; description: string }[];
}

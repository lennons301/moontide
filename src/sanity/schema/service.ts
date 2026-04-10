import { defineField, defineType } from "sanity";

export const service = defineType({
  name: "service",
  title: "Service",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title" },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "shortDescription",
      title: "Short Description",
      type: "text",
      rows: 3,
      description: "Used on the homepage service card",
    }),
    defineField({
      name: "fullDescription",
      title: "Full Description",
      type: "array",
      of: [{ type: "block" }],
      description: "Used on the service detail page",
    }),
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "category",
      title: "Category",
      type: "string",
      options: {
        list: [
          { title: "Class", value: "class" },
          { title: "Coaching", value: "coaching" },
          { title: "Community", value: "community" },
          { title: "Private", value: "private" },
        ],
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "bookingType",
      title: "Booking Type",
      type: "string",
      options: {
        list: [
          { title: "Online Booking (Stripe)", value: "stripe" },
          { title: "Contact Form", value: "contact" },
          { title: "Info Only", value: "info" },
        ],
      },
      initialValue: "stripe",
    }),
    defineField({
      name: "displayOrder",
      title: "Display Order",
      type: "number",
      description: "Order on the homepage (lower = first)",
    }),
  ],
  orderings: [
    {
      title: "Display Order",
      name: "displayOrder",
      by: [{ field: "displayOrder", direction: "asc" }],
    },
  ],
});

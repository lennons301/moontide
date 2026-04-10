import { defineField, defineType } from "sanity";

export const communityEvent = defineType({
  name: "communityEvent",
  title: "Community Event",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "date",
      title: "Date",
      type: "date",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
    }),
    defineField({
      name: "location",
      title: "Location",
      type: "string",
    }),
  ],
  orderings: [
    {
      title: "Date",
      name: "date",
      by: [{ field: "date", direction: "asc" }],
    },
  ],
});

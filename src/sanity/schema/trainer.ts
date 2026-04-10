import { defineField, defineType } from "sanity";

export const trainer = defineType({
  name: "trainer",
  title: "Trainer",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "bio",
      title: "Bio",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "photo",
      title: "Photo",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "qualifications",
      title: "Qualifications",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "year", title: "Year", type: "string" }),
            defineField({
              name: "description",
              title: "Description",
              type: "string",
            }),
          ],
        },
      ],
    }),
  ],
});

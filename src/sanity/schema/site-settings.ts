import { defineField, defineType } from "sanity";

export const siteSettings = defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Site Title",
      type: "string",
      initialValue: "Moontide",
    }),
    defineField({
      name: "contactEmail",
      title: "Contact Email",
      type: "string",
      initialValue: "gwaring5@googlemail.com",
    }),
    defineField({
      name: "heroTagline",
      title: "Hero Tagline",
      type: "text",
      rows: 4,
      description:
        "Text shown below the logo on the homepage. Use line breaks to separate lines (e.g. pronunciation on one line, definition on the next).",
    }),
    defineField({
      name: "instagramUrl",
      title: "Instagram URL",
      type: "url",
    }),
    defineField({
      name: "footerLinks",
      title: "Footer Links",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "label", title: "Label", type: "string" }),
            defineField({ name: "href", title: "URL", type: "string" }),
          ],
        },
      ],
    }),
  ],
});

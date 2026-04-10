import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "@/sanity/schema";
import { structure } from "@/sanity/structure";

export default defineConfig({
  name: "moontide",
  title: "Moontide",
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
  plugins: [structureTool({ structure })],
  schema: {
    types: schemaTypes,
  },
});

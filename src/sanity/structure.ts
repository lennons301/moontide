import type { StructureResolver } from "sanity/structure";

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Site Settings")
        .child(S.document().schemaType("siteSettings").documentId("siteSettings")),
      S.divider(),
      S.documentTypeListItem("service").title("Services"),
      S.documentTypeListItem("page").title("Pages"),
      S.documentTypeListItem("communityEvent").title("Community Events"),
      S.documentTypeListItem("trainer").title("Trainers"),
    ]);

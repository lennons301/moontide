// scripts/seed-sanity.ts
import { createClient } from "@sanity/client";

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  token: process.env.SANITY_API_TOKEN!,
  apiVersion: "2026-04-09",
  useCdn: false,
});

// Helper to create a portable text block from a string
function textBlock(text: string) {
  return [
    {
      _type: "block",
      _key: Math.random().toString(36).slice(2),
      style: "normal",
      markDefs: [],
      children: [
        {
          _type: "span",
          _key: Math.random().toString(36).slice(2),
          text,
          marks: [],
        },
      ],
    },
  ];
}

// Helper to create multiple portable text blocks from an array of strings
function textBlocks(paragraphs: string[]) {
  return paragraphs.map((text) => ({
    _type: "block" as const,
    _key: Math.random().toString(36).slice(2),
    style: "normal" as const,
    markDefs: [],
    children: [
      {
        _type: "span" as const,
        _key: Math.random().toString(36).slice(2),
        text,
        marks: [],
      },
    ],
  }));
}

async function seed() {
  console.log("Seeding Sanity CMS...\n");

  // 1. Site Settings
  console.log("Creating site settings...");
  await client.createOrReplace({
    _id: "siteSettings",
    _type: "siteSettings",
    title: "Moontide",
    contactEmail: "gwaring5@googlemail.com",
    footerLinks: [
      { _key: "1", label: "Prenatal", href: "/classes/prenatal" },
      { _key: "2", label: "Postnatal", href: "/classes/postnatal" },
      { _key: "3", label: "Baby Massage", href: "/classes/baby-yoga" },
      { _key: "4", label: "Private", href: "/private" },
      { _key: "5", label: "T&Cs", href: "/terms" },
    ],
  });

  // 2. Services
  const services = [
    {
      _id: "service-prenatal",
      title: "Prenatal Yoga",
      slug: { _type: "slug", current: "prenatal" },
      shortDescription:
        "Gentle movement and breath work to support you and your baby through pregnancy.",
      fullDescription: textBlocks([
        "Gentle movement and breath work to support you and your baby through pregnancy.",
        "Each class is designed to help you connect with your changing body, build strength for birth, and find calm in the journey ahead.",
      ]),
      category: "class",
      bookingType: "stripe",
      displayOrder: 1,
    },
    {
      _id: "service-postnatal",
      title: "Postnatal Yoga",
      slug: { _type: "slug", current: "postnatal" },
      shortDescription: "Rebuild strength and connection in the months after birth.",
      fullDescription: textBlocks([
        "Rebuild strength and connection in the months after birth.",
        "A nurturing space to restore your body, settle your mind, and meet other new mothers on the same path.",
      ]),
      category: "class",
      bookingType: "stripe",
      displayOrder: 2,
    },
    {
      _id: "service-baby-yoga",
      title: "Baby Yoga & Massage",
      slug: { _type: "slug", current: "baby-yoga" },
      shortDescription:
        "Bonding, relaxation and developmental support for you and your baby.",
      fullDescription: textBlocks([
        "Bonding, relaxation and developmental support for you and your baby.",
        "Learn gentle massage techniques and yoga-inspired movements that support your baby's development while deepening your connection.",
      ]),
      category: "class",
      bookingType: "stripe",
      displayOrder: 3,
    },
    {
      _id: "service-vinyasa",
      title: "Vinyasa Yoga Seasonal Flow",
      slug: { _type: "slug", current: "vinyasa" },
      shortDescription: "Seasonal flow connecting your practice to nature's rhythms.",
      fullDescription: textBlocks([
        "Seasonal flow connecting your practice to nature's rhythms.",
        "Each class draws on the energy of the current season — building heat in summer, turning inward in winter — to create a practice that moves with the world around you.",
      ]),
      category: "class",
      bookingType: "stripe",
      displayOrder: 4,
    },
    {
      _id: "service-coaching",
      title: "Transformational Coaching",
      slug: { _type: "slug", current: "coaching" },
      shortDescription:
        "One-to-one coaching to support you through life's transitions.",
      fullDescription: textBlocks([
        "One-to-one coaching to support you through life's transitions.",
        "Whether you're navigating motherhood, career change, or a deeper shift in who you are, coaching creates space to explore what's emerging and find your way forward.",
      ]),
      category: "coaching",
      bookingType: "contact",
      displayOrder: 5,
    },
    {
      _id: "service-community",
      title: "Creating Community",
      slug: { _type: "slug", current: "community" },
      shortDescription:
        "Gatherings and events for women to connect, share and grow together.",
      fullDescription: textBlocks([
        "Gatherings and events for women to connect, share and grow together.",
        "Community is at the heart of Moontide. These events bring women together to share stories, move, and remember that none of us are doing this alone.",
      ]),
      category: "community",
      bookingType: "info",
      displayOrder: 6,
    },
    {
      _id: "service-private",
      title: "Private Classes",
      slug: { _type: "slug", current: "private" },
      shortDescription:
        "Everyone comes to the mat for different reasons. Private classes are highly personalised to your desired outcomes for mind, body and spirit.",
      fullDescription: textBlocks([
        "Everyone comes to the mat for different reasons. Private classes are highly personalised to your desired outcomes for mind, body and spirit.",
        "Whether you're working through injury, preparing for birth, or simply want dedicated time for your practice, private sessions are shaped entirely around you.",
      ]),
      category: "private",
      bookingType: "contact",
      displayOrder: 7,
    },
  ];

  for (const service of services) {
    console.log(`Creating service: ${service.title}...`);
    await client.createOrReplace({
      _type: "service",
      ...service,
    });
  }

  // 3. Trainer
  console.log("Creating trainer profile...");
  await client.createOrReplace({
    _id: "trainer-gabrielle",
    _type: "trainer",
    name: "Gabrielle",
    bio: textBlocks([
      "Yoga teacher and transformational coach supporting women through every phase of life.",
    ]),
    qualifications: [
      {
        _key: "q1",
        year: "2024",
        description:
          "Pre and Postnatal Yoga Teacher Training with Baby Yoga and Massage with Katie Appleton",
      },
      {
        _key: "q2",
        year: "2022",
        description: "Yin Yoga and Chakras Teacher Training, The Yoga People",
      },
      {
        _key: "q3",
        year: "2021",
        description: "200 hour Vinyasa Yoga Teacher Training, More Yoga",
      },
    ],
  });

  // 4. Terms page
  console.log("Creating Terms & Conditions page...");
  await client.createOrReplace({
    _id: "page-terms",
    _type: "page",
    title: "Terms & Conditions",
    slug: { _type: "slug", current: "terms" },
    content: [
      {
        _type: "block",
        _key: Math.random().toString(36).slice(2),
        style: "h2",
        markDefs: [],
        children: [
          {
            _type: "span",
            _key: Math.random().toString(36).slice(2),
            text: "Bookings and Cancellations",
            marks: [],
          },
        ],
      },
      ...textBlock(
        "All purchases are non-refundable. Please contact me directly if you would like to cancel or reschedule a class. Should I have to cancel a class, a credit will be issued and can be transferred to another class at a suitable time, subject to availability.",
      ),
      {
        _type: "block",
        _key: Math.random().toString(36).slice(2),
        style: "h2",
        markDefs: [],
        children: [
          {
            _type: "span",
            _key: Math.random().toString(36).slice(2),
            text: "Bundles",
            marks: [],
          },
        ],
      },
      ...textBlock("Class bundles will expire 90 days from the date of purchase."),
    ],
  });

  console.log("\n✓ Sanity CMS seeded successfully!");
  console.log("  - 1 site settings document");
  console.log("  - 7 service documents");
  console.log("  - 1 trainer document");
  console.log("  - 1 terms page");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

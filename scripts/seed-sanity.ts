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
        "These classes are designed to ease common discomforts, build strength and flexibility, and nurture a deep connection with your growing baby. Suitable from the second trimester onwards.",
      ]),
      category: "class",
      bookingType: "stripe",
      displayOrder: 1,
    },
    {
      _id: "service-postnatal",
      title: "Postnatal Yoga",
      slug: { _type: "slug", current: "postnatal" },
      shortDescription:
        "Rebuild strength and connection in the months after birth.",
      fullDescription: textBlocks([
        "Rebuild strength and connection in the months after birth.",
        "These classes offer a gentle, supported return to movement, focusing on pelvic floor health, core reconnection and emotional wellbeing. Babies are welcome and encouraged to join.",
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
        "Through gentle massage strokes and playful yoga-inspired movements, you will learn to read your baby's cues, support their physical development, and deepen your bond through touch.",
      ]),
      category: "class",
      bookingType: "stripe",
      displayOrder: 3,
    },
    {
      _id: "service-vinyasa",
      title: "Vinyasa Yoga Seasonal Flow",
      slug: { _type: "slug", current: "vinyasa" },
      shortDescription:
        "Seasonal flow connecting your practice to nature's rhythms.",
      fullDescription: textBlocks([
        "Seasonal flow connecting your practice to nature's rhythms.",
        "Each series honours the qualities of the season — the stillness of winter, the renewal of spring, the abundance of summer, the release of autumn — weaving breath, movement and reflection into a practice that feels alive.",
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
        "Life is full of transitions — some chosen, some not. Transformational coaching offers a dedicated space to explore what is shifting in your life, to identify what you truly want, and to move forward with clarity and confidence.",
        "Working one-to-one, we will draw on a range of embodied and somatic practices alongside coaching methodologies to support you in reconnecting with your own wisdom. Whether you are navigating a career change, a shift in identity, a relationship transition or simply a sense that something needs to change, coaching can help you find your way.",
        "Sessions are held online or in person, and are tailored entirely to you.",
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
        "Connection is at the heart of everything I do. Creating Community is about bringing women together to share, to grow and to be seen — away from the relentless pace of everyday life.",
        "Gatherings take the form of seasonal rituals, workshops, day retreats and online events. Each one is thoughtfully held, weaving together movement, reflection, conversation and rest.",
        "Whether you are new to this kind of gathering or have been part of women's circles for years, all are welcome.",
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
      "Hi, I'm Gabrielle — a yoga teacher and transformational coach supporting women through every phase of life.",
      "My practice is rooted in the belief that wellbeing is not a destination but a living, breathing relationship with ourselves. Through movement, breath and community, I create spaces where women can slow down, come home to their bodies, and move through change with grace.",
      "Whether you're navigating pregnancy, early motherhood, or simply seeking more stillness in your day-to-day life, I'm here to support your journey.",
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
      ...textBlock(
        "Class bundles will expire 90 days from the date of purchase.",
      ),
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

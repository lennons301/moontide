import type { Service } from "@/lib/sanity/types";

/**
 * The content the site shows when the CMS has nothing to say — because it is
 * unreachable, or because nobody has written the document yet.
 *
 * One copy of each, held here rather than in the page that renders it: the
 * trainer's fallback used to live twice (the homepage's name and short bio,
 * `/about`'s qualifications) with no way to notice the two disagreed, and each
 * service's fallback copy lived in the page for that service.
 */

/** The copy a service falls back to, whichever page is asking for it. */
export interface ServiceCopy {
  title: string;
  /** One line, for the services grid. */
  shortDescription?: string;
  /** The long copy, in plain paragraphs — the CMS answers in Portable Text. */
  descriptionParagraphs: string[];
}

interface ServiceFallback extends ServiceCopy {
  category: Service["category"];
  bookingType: Service["bookingType"];
  displayOrder: number;
}

export const fallbackServiceBySlug: Record<string, ServiceFallback> = {
  prenatal: {
    title: "Prenatal Yoga",
    shortDescription:
      "Gentle movement and breath work to support you and your baby through pregnancy.",
    descriptionParagraphs: [
      "Gentle movement and breath work to support you and your baby through pregnancy. These classes are designed to ease common discomforts, build strength and flexibility, and nurture a deep connection with your growing baby. Suitable from the second trimester onwards.",
    ],
    category: "class",
    bookingType: "stripe",
    displayOrder: 1,
  },
  postnatal: {
    title: "Postnatal Yoga",
    shortDescription:
      "Rebuild strength and connection in the months after birth.",
    descriptionParagraphs: [
      "Rebuild strength and connection in the months after birth. These classes offer a gentle, supported return to movement, focusing on pelvic floor health, core reconnection and emotional wellbeing. Babies are welcome and encouraged to join.",
    ],
    category: "class",
    bookingType: "stripe",
    displayOrder: 2,
  },
  "baby-yoga": {
    title: "Baby Yoga & Massage",
    shortDescription:
      "Bonding, relaxation and developmental support for you and your baby.",
    descriptionParagraphs: [
      "Bonding, relaxation and developmental support for you and your baby. Through gentle massage strokes and playful yoga-inspired movements, you will learn to read your baby's cues, support their physical development, and deepen your bond through touch.",
    ],
    category: "class",
    bookingType: "stripe",
    displayOrder: 3,
  },
  vinyasa: {
    title: "Autumn Equinox Yin",
    shortDescription:
      "Seasonal flow connecting your practice to nature's rhythms.",
    descriptionParagraphs: [
      "Seasonal flow connecting your practice to nature's rhythms. Each series honours the qualities of the season — the stillness of winter, the renewal of spring, the abundance of summer, the release of autumn — weaving breath, movement and reflection into a practice that feels alive.",
    ],
    category: "class",
    bookingType: "stripe",
    displayOrder: 4,
  },
  coaching: {
    title: "Transformational Coaching",
    shortDescription:
      "One-to-one coaching to support you through life's transitions.",
    descriptionParagraphs: [
      "Life is full of transitions — some chosen, some not. Transformational coaching offers a dedicated space to explore what is shifting in your life, to identify what you truly want, and to move forward with clarity and confidence.",
      "Working one-to-one, we will draw on a range of embodied and somatic practices alongside coaching methodologies to support you in reconnecting with your own wisdom. Whether you are navigating a career change, a shift in identity, a relationship transition or simply a sense that something needs to change, coaching can help you find your way.",
      "Sessions are held online or in person, and are tailored entirely to you.",
    ],
    category: "coaching",
    bookingType: "contact",
    displayOrder: 5,
  },
  community: {
    title: "Creating Community",
    shortDescription:
      "Gatherings and events for women to connect, share and grow together.",
    descriptionParagraphs: [
      "Connection is at the heart of everything I do. Creating Community is about bringing women together to share, to grow and to be seen — away from the relentless pace of everyday life.",
      "Gatherings take the form of seasonal rituals, workshops, day retreats and online events. Each one is thoughtfully held, weaving together movement, reflection, conversation and rest.",
      "Whether you are new to this kind of gathering or have been part of women's circles for years, all are welcome.",
    ],
    category: "community",
    bookingType: "info",
    displayOrder: 6,
  },
  private: {
    title: "Private Classes",
    shortDescription:
      "Everyone comes to the mat for different reasons. Private classes are highly personalised to your desired outcomes for mind, body and spirit.",
    descriptionParagraphs: [
      "Everyone comes to the mat for different reasons. Private classes are highly personalised to your desired outcomes for mind, body and spirit.",
    ],
    category: "private",
    bookingType: "contact",
    displayOrder: 7,
  },
};

/**
 * A slug nothing knows about — reached only by `/classes/<slug>` for a class
 * that is neither in the CMS nor above.
 */
export const unknownServiceFallback: ServiceCopy = {
  title: "Class",
  descriptionParagraphs: ["Class details coming soon."],
};

/** The services grid, in the order the CMS would have returned them. */
export const fallbackServices: Service[] = Object.entries(fallbackServiceBySlug)
  .map(([slug, fallback]) => ({
    _id: `fallback-${slug}`,
    title: fallback.title,
    slug: { current: slug },
    shortDescription: fallback.shortDescription,
    category: fallback.category,
    bookingType: fallback.bookingType,
    displayOrder: fallback.displayOrder,
  }))
  .sort((a, b) => a.displayOrder - b.displayOrder);

/**
 * Gabrielle. The one fallback for the trainer document, shared by the homepage
 * (name, short bio, photo) and `/about` (bio, qualifications).
 */
export const fallbackTrainer = {
  name: "Gabrielle",
  shortBio:
    "Yoga teacher and transformational coach supporting women through every phase of life.",
  bioParagraphs: [
    "Hi, I'm Gabrielle — a yoga teacher and transformational coach supporting women through every phase of life.",
    "My practice is rooted in the belief that wellbeing is not a destination but a living, breathing relationship with ourselves. Through movement, breath and community, I create spaces where women can slow down, come home to their bodies, and move through change with grace.",
    "Whether you're navigating pregnancy, early motherhood, or simply seeking more stillness in your day-to-day life, I'm here to support your journey.",
  ],
  qualifications: [
    {
      year: "2024",
      description:
        "Pre and Postnatal Yoga Teacher Training with Baby Yoga and Massage with Katie Appleton",
    },
    {
      year: "2022",
      description: "Yin Yoga and Chakras Teacher Training, The Yoga People",
    },
    {
      year: "2021",
      description: "200 hour Vinyasa Yoga Teacher Training, More Yoga",
    },
  ],
};

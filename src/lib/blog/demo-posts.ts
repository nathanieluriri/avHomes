import type { DocNode, PublicPost, PublicPostDetail } from "./types";

/**
 * Fixture posts for demo mode. The kitchen-sink document below deliberately
 * exercises every node type and mark the renderer supports, including the
 * hostile hrefs the allow-list has to reject, so the reader can be verified
 * without the upstream service.
 */

const p = (text: string): DocNode => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

const h = (level: 2 | 3, text: string): DocNode => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});

const li = (text: string): DocNode => ({
  type: "listItem",
  content: [p(text)],
});

const task = (checked: boolean, text: string): DocNode => ({
  type: "taskItem",
  attrs: { checked },
  content: [p(text)],
});

const cell = (text: string, colwidth?: number[]): DocNode => ({
  type: "tableCell",
  attrs: colwidth ? { colwidth } : {},
  content: [p(text)],
});

const headerCell = (text: string, colwidth?: number[]): DocNode => ({
  type: "tableHeader",
  attrs: colwidth ? { colwidth } : {},
  content: [p(text)],
});

const kitchenSink = (topic: string): DocNode => ({
  type: "doc",
  content: [
    p(
      `Every figure below is illustrative. ${topic} moves with the market, so treat these as a way to frame the question rather than a quote.`
    ),

    h(2, "What the numbers actually cover"),
    p(
      "Service charge, agency fees and legal costs are quoted separately more often than not, which makes two listings at the same headline price behave very differently once you have signed."
    ),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "The important distinction is between " },
        { type: "text", marks: [{ type: "bold" }], text: "recurring" },
        { type: "text", text: " costs and " },
        { type: "text", marks: [{ type: "italic" }], text: "one off" },
        { type: "text", text: " costs. Some agents will " },
        { type: "text", marks: [{ type: "strike" }], text: "quietly" },
        { type: "text", text: " roll the second into the first, and a line item marked " },
        { type: "text", marks: [{ type: "code" }], text: "misc" },
        { type: "text", text: " is worth " },
        { type: "text", marks: [{ type: "underline" }], text: "always" },
        { type: "text", text: " querying." },
      ],
    },

    {
      type: "blockquote",
      content: [
        p(
          "Ask for the last twelve months of actual spend, not the budget. A budget is a plan. Spend is what happened."
        ),
      ],
    },

    h(3, "A worked comparison"),
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            headerCell("Item", [240]),
            headerCell("Lekki", [130]),
            headerCell("Ikoyi", [130]),
            headerCell("Notes"),
          ],
        },
        {
          type: "tableRow",
          content: [
            cell("Service charge"),
            cell("N1.8m"),
            cell("N3.2m"),
            cell("Per year, per unit"),
          ],
        },
        {
          type: "tableRow",
          content: [cell("Power"), cell("Shared"), cell("Dedicated"), cell("Diesel is billed on use")],
        },
        {
          type: "tableRow",
          content: [cell("Security"), cell("Estate"), cell("Building"), cell("Manned in both cases")],
        },
      ],
    },

    h(2, "Before you sign"),
    {
      type: "taskList",
      content: [
        task(true, "Ask for twelve months of actual service charge spend"),
        task(true, "Confirm who holds the certificate of occupancy"),
        task(false, "Get the sinking fund balance in writing"),
        task(false, "Walk the compound after dark, not just at midday"),
      ],
    },

    h(3, "Ordered by how often it bites"),
    {
      type: "orderedList",
      attrs: { start: 1 },
      content: [
        li("Service charge that resets after year one"),
        li("Parking sold separately from the unit"),
        {
          type: "listItem",
          content: [
            p("Fees that only appear at closing"),
            {
              type: "bulletList",
              content: [li("Legal, typically five per cent"), li("Agency, typically five per cent")],
            },
          ],
        },
      ],
    },

    {
      type: "codeBlock",
      attrs: { language: "text" },
      content: [
        {
          type: "text",
          text:
            "total_year_one =\n    price\n  + (price * 0.05)   # agency\n  + (price * 0.05)   # legal\n  + service_charge",
        },
      ],
    },

    { type: "horizontalRule" },

    h(2, "Where to read further"),
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Our " },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "/listings?status=For+Sale" } }],
          text: "current sale listings",
        },
        { type: "text", text: " each publish a service charge figure. The " },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "https://www.lagosstate.gov.ng" } }],
          text: "Lagos State portal",
        },
        { type: "text", text: " is the authority on land charges." },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "These two render as plain text because the allow-list rejects a protocol-relative authority: ",
        },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "//evil.example" } }],
          text: "//evil.example",
        },
        { type: "text", text: " and " },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: "/\\evil.example" } }],
          text: "/\\evil.example",
        },
        { type: "text", text: "." },
      ],
    },

    {
      type: "image",
      attrs: {
        src: "/images/library/interior-04.jpg",
        alt: "A finished living space in a completed handover",
        title: "Handover condition is the only condition that counts.",
      },
    },

    p(
      "If a seller will not put a number in writing, that is itself the answer. Walk, or price the uncertainty in."
    ),
    {
      type: "unknownFutureNode",
      content: [p("An unrecognised node still renders its children, so no words are lost.")],
    },
  ],
});

interface Seed {
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  category: string;
  tags: string[];
  template: PublicPost["template"];
  cover: string | null;
  coverAlt: string;
  published: string;
  updated: string;
  words: number;
  minutes: number;
  author: string;
}

const seeds: Seed[] = [
  {
    slug: "lagos-service-charge-explained",
    title: "What service charge in Lagos actually covers, and what it should not",
    subtitle: "Two listings at the same price can cost very different amounts to live in",
    excerpt:
      "Service charge is the least understood line in a Lagos tenancy. Here is how to read one, what figure looks like per square metre, and the charges you should push back on.",
    category: "Buying Guide",
    tags: ["Service charge", "Lagos", "Buying"],
    template: "magazine",
    cover: "/images/library/interior-07.jpg",
    coverAlt: "A serviced apartment interior in Lekki",
    published: "2026-08-04",
    updated: "2026-08-06",
    words: 1180,
    minutes: 6,
    author: "Adaeze Vincent",
  },
  {
    slug: "off-plan-risk-checklist",
    title: "Buying off plan without getting burned: a nine point checklist",
    subtitle: "Off plan can be the best value on the market, or the most expensive mistake",
    excerpt:
      "Off plan can be the best value in the market. It can also be the fastest way to lose a deposit. The difference is nine questions asked before you sign anything.",
    category: "Buying Guide",
    tags: ["Off plan", "Risk", "Buying"],
    template: "minimal",
    cover: null,
    coverAlt: "",
    published: "2026-07-22",
    updated: "2026-07-22",
    words: 940,
    minutes: 5,
    author: "Tobi Ade-Johnson",
  },
  {
    slug: "governors-consent-timeline",
    title: "Governor's consent: a realistic timeline for 2026",
    subtitle: "Everyone quotes three months, and almost nobody closes in three months",
    excerpt:
      "Everyone quotes three months. Here is what the process actually involves, where it stalls, and how to keep it moving without paying for speed you will not get.",
    category: "Legal",
    tags: ["Legal", "Consent", "Lagos"],
    template: "editorial",
    cover: "/images/library/exterior-06.jpg",
    coverAlt: "Rooftops across a Lagos neighbourhood at golden hour",
    published: "2026-07-09",
    updated: "2026-07-15",
    words: 1460,
    minutes: 7,
    author: "Ifeanyi Okoro",
  },
  {
    slug: "abuja-vs-lagos-yields",
    title: "Abuja versus Lagos rental yields, measured properly",
    subtitle: "Headline yields hide the vacancy that decides the return",
    excerpt:
      "Headline yields flatter Abuja and punish Lagos. Adjust for vacancy, service charge and turnover cost and two of the five segments swap places entirely.",
    category: "Investing",
    tags: ["Investing", "Yields", "Abuja"],
    template: "technical",
    cover: "/images/library/exterior-09.jpg",
    coverAlt: "A residential street in Maitama, Abuja",
    published: "2026-06-28",
    updated: "2026-07-02",
    words: 2040,
    minutes: 10,
    author: "Adaeze Vincent",
  },
  {
    slug: "snagging-list-handover",
    title: "The snagging list to bring to every handover inspection",
    subtitle: "Forty items, ordered by how expensive they are to fix later",
    excerpt:
      "Forty items, ordered by how expensive each one is to fix after you have taken the keys. Print it, walk the unit twice, and do not sign until the list is closed.",
    category: "Buying Guide",
    tags: ["Handover", "Snagging", "Buying"],
    template: "minimal",
    cover: "/images/library/interior-02.jpg",
    coverAlt: "An empty room at handover",
    published: "2026-06-11",
    updated: "2026-06-11",
    words: 760,
    minutes: 4,
    author: "Tobi Ade-Johnson",
  },
  {
    slug: "solar-battery-payback",
    title: "Solar and battery in a Lagos duplex: the real payback period",
    subtitle: "Measured against diesel at the price you are actually paying",
    excerpt:
      "We ran the numbers against diesel at current prices for a four bedroom duplex. The payback is shorter than most installers claim, and the reason is not the panels.",
    category: "Sustainability",
    tags: ["Solar", "Energy", "Running costs"],
    template: "magazine",
    cover: "/images/library/exterior-10.jpg",
    coverAlt: "A duplex with a rooftop solar array",
    published: "2026-05-30",
    updated: "2026-06-03",
    words: 1320,
    minutes: 7,
    author: "Ifeanyi Okoro",
  },
];

function toPost(seed: Seed): PublicPost {
  return {
    id: `demo_${seed.slug}`,
    slug: seed.slug,
    title: seed.title,
    subtitle: seed.subtitle,
    excerpt: seed.excerpt,
    coverImage: seed.cover
      ? {
          url: seed.cover,
          alt: seed.coverAlt,
          focalPoint: "50% 50%",
          width: 1600,
          height: 900,
        }
      : null,
    category: seed.category,
    tags: seed.tags,
    template: seed.template,
    publishedAt: Date.parse(`${seed.published}T09:00:00Z`),
    updatedAt: Date.parse(`${seed.updated}T09:00:00Z`),
    wordCount: seed.words,
    readingTime: seed.minutes,
    author: { name: seed.author },
  };
}

export const demoPosts: PublicPost[] = seeds.map(toPost);

export const demoPostDetails: PublicPostDetail[] = seeds.map((seed) => ({
  ...toPost(seed),
  content: kitchenSink(seed.category.toLowerCase()),
}));

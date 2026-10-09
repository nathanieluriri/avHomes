import {
  CALLOUT_DEFAULTS,
  estateSummary,
  formatPrice,
  hasOptions,
  summarise,
  type CalloutAttrs,
  type DocNode,
  type ListingCardAttrs,
  type Property,
} from "@avhomes/contracts";

/** A listing as a newsletter card, priced the way the site prices it. */
export function cardFromProperty(property: Property, origin: string): ListingCardAttrs {
  const options = hasOptions(property.type) && property.prototypes.length > 0;
  const minor = options ? estateSummary(property.prototypes).fromMinor : property.priceMinor;
  const price = minor > 0 ? `${options ? "From " : ""}${formatPrice(minor, property)}` : "";
  const image = property.images.find((url) => /^https:\/\//iu.test(url)) ?? "";
  return {
    propertyId: property.id,
    title: property.title.slice(0, 160),
    blurb: summarise(property.tagline || property.description || "", 160),
    price,
    href: property.slug ? `${origin}/listings/${property.slug}` : `${origin}/listings`,
    imageUrl: image,
  };
}

const p = (text: string): DocNode => (text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" });
const h2 = (text: string): DocNode => ({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] });
const small = (text: string): DocNode => ({
  type: "paragraph",
  content: [{ type: "text", text: text.toUpperCase(), marks: [{ type: "bold" }] }],
});
const card = (attrs: ListingCardAttrs): DocNode => ({ type: "listingCard", attrs: { ...attrs } });
const callout = (attrs: CalloutAttrs): DocNode => ({ type: "callout", attrs: { ...attrs } });

export interface TemplateInput {
  listings: Property[];
  origin: string;
  payCutoffDay: number;
  now: Date;
}

export interface NewsletterTemplate {
  id: string;
  name: string;
  description: string;
  build: (input: TemplateInput) => { subject: string; preheader: string; content: DocNode };
}

function monthName(date: Date): string {
  return date.toLocaleString("en-GB", { month: "long" });
}

function homesWord(n: number): string {
  return ["No", "One", "Two", "Three", "Four"][n] ?? String(n);
}

export const NEWSLETTER_TEMPLATES: NewsletterTemplate[] = [
  {
    id: "partners-update",
    name: "Partners update",
    description: "New listings to share as cards, then the pay day notice.",
    build: ({ listings, origin, payCutoffDay, now }) => {
      const cards = listings.slice(0, 3).map((listing) => card(cardFromProperty(listing, origin)));
      const count = homesWord(cards.length);
      return {
        subject: `${count} new homes to share this month`,
        preheader: "Every one pays the full partner rate.",
        content: {
          type: "doc",
          content: [
            small(`${monthName(now)} ${now.getFullYear()}`),
            h2(`${count} new homes to share`),
            p("Hello partners. We opened new listings this month, and every one of them pays the full partner rate. Share them with the buyers you know, and report the deal in the app the moment it closes."),
            ...cards,
            callout({
              ...CALLOUT_DEFAULTS,
              eyebrow: "Pay day",
              title: `Money goes out on ${payCutoffDay} ${monthName(now)}`,
              text: `Anything approved after the ${payCutoffDay}th goes out the month after. Check that your bank account is saved in the app so nothing is held back.`,
            }),
          ],
        },
      };
    },
  },
  {
    id: "new-listings",
    name: "New listings",
    description: "For subscribers: the latest homes as cards and a line on how to ask.",
    build: ({ listings, origin }) => ({
      subject: "Fresh on AV Homes",
      preheader: "Homes we have checked on the ground, new this week.",
      content: {
        type: "doc",
        content: [
          h2("Fresh on AV Homes"),
          p("Every home below was inspected by our team before it went live."),
          ...listings.slice(0, 4).map((listing) => card(cardFromProperty(listing, origin))),
          p("Want to see one in person, or by video call from abroad? Reply to this email and we will set it up."),
        ],
      },
    }),
  },
  {
    id: "announcement",
    name: "Announcement",
    description: "A heading, a few lines and one highlighted notice.",
    build: () => ({
      subject: "",
      preheader: "",
      content: {
        type: "doc",
        content: [
          h2("Your headline"),
          p("Say what is happening in two or three sentences."),
          callout({ ...CALLOUT_DEFAULTS, eyebrow: "Save the date", title: "What, where and when", text: "One line on what to do next." }),
        ],
      },
    }),
  },
];

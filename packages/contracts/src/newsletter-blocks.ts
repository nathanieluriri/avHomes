/**
 * The two blocks a newsletter can hold beyond ordinary text: a card for one
 * listing, and a dark callout such as the pay day notice. Both are atoms whose
 * whole content lives in `attrs`, so the editor, the validator and the email
 * renderer agree on one flat shape.
 */

export interface ListingCardAttrs {
  /** The listing it was made from, so the editor can refresh it. Empty for a hand-made card. */
  propertyId: string;
  title: string;
  blurb: string;
  /** Already formatted, such as "₦2,500,000 per year". */
  price: string;
  href: string;
  /** Empty for a card without a picture. */
  imageUrl: string;
}

export interface CalloutAttrs {
  eyebrow: string;
  title: string;
  text: string;
}

export const LISTING_CARD_DEFAULTS: ListingCardAttrs = {
  propertyId: "",
  title: "",
  blurb: "",
  price: "",
  href: "",
  imageUrl: "",
};

export const CALLOUT_DEFAULTS: CalloutAttrs = { eyebrow: "", title: "", text: "" };

export const BLOCK_TEXT_MAX = { title: 160, blurb: 400, price: 60, eyebrow: 60, text: 600 } as const;

"use client";

import { OWNERSHIP_LABEL, type Ownership } from "@avhomes/contracts";
import { Badge } from "./ui";

/**
 * AV Homes' own property, or somebody else's.
 *
 * One component so the wording is one wording. It appeared in three places while
 * this was being built (the listing form, a transaction row, the marketer app's
 * listing card) and each had reached for its own phrasing: "Partner", "External",
 * "3rd party". The owner's word is "Non-AV", and `OWNERSHIP_LABEL` is where it
 * lives.
 *
 * Wine for AV Homes' own, neutral for everybody else's, and the LABEL carries the
 * meaning either way: the colour is a second signal, never the only one.
 */
export function OwnershipBadge({ ownership }: { ownership: Ownership }) {
  return (
    <Badge tone={ownership === "av" ? "wine" : "neutral"}>{OWNERSHIP_LABEL[ownership]}</Badge>
  );
}

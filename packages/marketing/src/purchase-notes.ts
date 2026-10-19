import type { Db } from "mongodb";
import { formatMoney, type Deal, type DealShare, type PushMessage } from "@avhomes/contracts";
import { findMarketerById, userIdsFor } from "./repo";
import type { SendTemplate } from "./whatsapp";

export interface NoteDeps {
  tell?: (db: Db, userIds: string[], message: PushMessage, options?: { urgency?: "high" | "normal" }) => Promise<void>;
  mail?: SendTemplate;
}

export type PurchaseStep = "interest" | "payment-received" | "payment-verified" | "instalment-verified" | "owner";

const STEP: Record<Exclude<PurchaseStep, "owner">, { headline: string; message: (property: string) => string }> = {
  interest: {
    headline: "We received your interest",
    message: (p) => `Thank you for wanting to buy ${p}. AV Homes will be in touch about the next steps.`,
  },
  "payment-received": {
    headline: "We received your payment",
    message: (p) => `Your payment proof for ${p} is with AV Homes. We will let you know once it is verified.`,
  },
  "payment-verified": {
    headline: "Your payment is verified",
    message: (p) => `AV Homes has verified your payment for ${p}.`,
  },
  "instalment-verified": {
    headline: "Your instalment is verified",
    message: (p) => `AV Homes has verified your latest payment on ${p}.`,
  },
};

function firstOf(name: string): string {
  return name.trim().split(/\s+/u)[0] || name;
}

async function push(deps: NoteDeps, db: Db, marketerId: string, message: PushMessage): Promise<void> {
  if (!deps.tell) return;
  try {
    const userId = (await userIdsFor(db, [marketerId])).get(marketerId);
    if (userId) await deps.tell(db, [userId], message);
  } catch (err) {
    console.error("[push]", JSON.stringify({ where: "purchase", message: err instanceof Error ? err.message : String(err) }));
  }
}

/** Push and email to a partner buying for themselves, at one step of their purchase. */
export async function tellPurchase(
  deps: NoteDeps,
  db: Db,
  input: { marketerId: string; property: string; step: PurchaseStep; origin: string; requestId: string },
): Promise<void> {
  const marketer = await findMarketerById(db, input.marketerId);
  if (!marketer) return;
  const link = `${input.origin}/m/purchases`;
  const owner = input.step === "owner";
  const title = owner ? `Congratulations, you now own ${input.property}` : STEP[input.step as Exclude<PurchaseStep, "owner">].headline;
  const body = owner
    ? `You are now the proud owner of ${input.property}.`
    : STEP[input.step as Exclude<PurchaseStep, "owner">].message(input.property);
  await push(deps, db, marketer.id, { kind: "purchase-update", title, body, url: "/m/purchases", tag: `purchase-${input.property}` });
  if (deps.mail && marketer.email.trim() !== "") {
    const name = firstOf(marketer.displayName);
    const ctx = { requestId: input.requestId, route: "purchase update" };
    if (owner) {
      await deps.mail(db, marketer.email, "purchase-owner", { name, property: input.property, link }, ctx);
    } else {
      await deps.mail(db, marketer.email, "purchase-update", { name, property: input.property, headline: title, message: body, link }, ctx);
    }
  }
}

/** Uplines earn on every verified plan payment, not only at approval, so each one is told. */
export async function tellUplineShares(
  deps: NoteDeps,
  db: Db,
  input: { deal: Deal; shares: readonly DealShare[] },
): Promise<void> {
  const { deal } = input;
  const closer = firstOf(deal.closerName || deal.reporterName);
  for (const share of input.shares) {
    if (share.marketerId === deal.reporterId || share.amountMinor <= 0) continue;
    await push(deps, db, share.marketerId, {
      kind: "share-earned",
      title: `You earned ${formatMoney(share.amountMinor, deal.currency)}`,
      body: `Your level ${share.level} share of a payment on ${closer}'s deal on ${deal.listingTitle}.`,
      url: `/m/deals/${deal.id}`,
      tag: `deal-${deal.id}`,
    });
  }
}

/** The partner who reported a plan deal hears that a payment was verified, and what it earned them. */
export async function tellPaymentVerified(
  deps: NoteDeps,
  db: Db,
  input: { deal: Deal; amountMinor: number; earnedMinor: number; origin: string; requestId: string },
): Promise<void> {
  const { deal } = input;
  const marketer = await findMarketerById(db, deal.reporterId);
  if (!marketer) return;
  const money = (minor: number) => formatMoney(minor, deal.currency);
  await push(deps, db, marketer.id, {
    kind: "plan-payment",
    title: `Payment verified on ${deal.listingTitle}`,
    body: input.earnedMinor > 0 ? `You earned ${money(input.earnedMinor)} from it.` : `${money(input.amountMinor)} was verified.`,
    url: `/m/deals/${deal.id}`,
    tag: `deal-${deal.id}`,
  });
  if (deps.mail && marketer.email.trim() !== "") {
    await deps.mail(
      db,
      marketer.email,
      "plan-payment-verified",
      {
        name: firstOf(marketer.displayName),
        property: deal.listingTitle,
        amount: money(input.amountMinor),
        paid: money(deal.paidMinor),
        left: money(Math.max(0, deal.amountMinor - deal.paidMinor)),
        earned: money(input.earnedMinor),
        dealLink: `${input.origin}/m/deals/${deal.id}`,
      },
      { requestId: input.requestId, route: "plan payment verified" },
    );
  }
}

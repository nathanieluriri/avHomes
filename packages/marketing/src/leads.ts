/**
 * Potential buyers, and the pipeline both sides watch.
 *
 * Its own module rather than more of `repo.ts`, which is already the longest
 * file in the package and carries a different invariant: that one is about what
 * somebody is owed, this one is about where a person has got to.
 *
 * The rule this file exists to hold: **a state never moves without a reason and
 * a note, and nothing in the history is ever overwritten.** Every write below
 * appends to `events` and sets `state` from it. There is no update path that
 * touches `state` alone, on either surface, which is what makes the timeline
 * trustworthy rather than merely present.
 */

import type { Db, Filter } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import { NotFoundError, PreconditionFailedError, newId } from "@avhomes/core";
import {
  isLeadOpen,
  leadMoveRefusal,
  marketerMayMove,
  type DealKind,
  type Lead,
  type LeadEvent,
  type LeadRow,
  type LeadState,
  type LeadUnit,
  type Marketer,
  type MarketingSettings,
} from "@avhomes/contracts";
import { toLead, type DealDoc, type LeadDoc } from "./schema";
import { cancelDeal, createDeal, reviewDeal } from "./repo";

function leads(db: Db) {
  return collection<LeadDoc>(db, COLLECTIONS.marketingLeads);
}

export interface LeadInput {
  buyerName: string;
  buyerPhone: string;
  listingId: string | null;
  listingTitle: string;
  wantUnits: LeadUnit[];
  wantKind: DealKind | null;
  wantArea: string;
  wantBudgetMinor: number;
  brief: string;
}

/** Who is moving it, and under which set of rules. */
export interface LeadActor {
  id: string;
  name: string;
  side: "marketer" | "admin";
}

export async function createLead(
  db: Db,
  reporter: Marketer,
  input: LeadInput,
  settings: MarketingSettings,
): Promise<Lead> {
  const now = Date.now();

  /* The same guard deals keep, for the same reason: a marketer introducing
     themselves is not an introduction. Checked on the last ten digits because
     the two numbers may be written with different prefixes and spacing. */
  if (settings.blockSelfDeals && input.buyerPhone.trim() !== "") {
    const digits = input.buyerPhone.replace(/[^0-9]/gu, "").slice(-10);
    if (digits !== "" && reporter.phone.replace(/[^0-9]/gu, "").endsWith(digits)) {
      throw new PreconditionFailedError("self_lead", {
        detail: "That is your own number. Log somebody you are introducing to AV Homes.",
      });
    }
  }

  const doc: LeadDoc = {
    _id: newId("lead", now),
    buyerName: input.buyerName.trim(),
    buyerPhone: input.buyerPhone.trim(),
    listingId: input.listingId,
    listingTitle: input.listingTitle,
    wantUnits: input.wantUnits,
    wantKind: input.wantKind,
    wantArea: input.wantArea.trim(),
    wantBudgetMinor: input.wantBudgetMinor,
    currency: settings.currency,
    brief: input.brief.trim(),
    reporterId: reporter.id,
    reporterName: reporter.displayName,
    reporterCode: reporter.code,
    state: "new",
    // The first event, so the timeline is never empty and has an author.
    events: [
      {
        at: now,
        from: "new",
        to: "new",
        bySide: "marketer",
        byName: reporter.displayName,
        reason: "Logged by marketer",
        note: input.brief.trim() || "Logged a potential buyer.",
      },
    ],
    dealId: null,
    createdAt: now,
    updatedAt: now,
  };

  await leads(db).insertOne(doc);
  return toLead(doc);
}

export interface LeadListQuery {
  state?: LeadState;
  reporterId?: string;
  /** Matches buyer name, phone or the marketer who logged it. */
  q?: string;
  limit: number;
}

export async function listLeads(
  db: Db,
  query: LeadListQuery,
): Promise<{ items: Lead[]; total: number }> {
  const filter: Filter<LeadDoc> = {};
  if (query.state) filter.state = query.state;
  if (query.reporterId) filter.reporterId = query.reporterId;
  if (query.q && query.q.trim() !== "") {
    const rx = { $regex: escapeRx(query.q.trim()), $options: "i" };
    filter.$or = [{ buyerName: rx }, { buyerPhone: rx }, { reporterName: rx }, { reporterCode: rx }];
  }

  const [docs, total] = await Promise.all([
    leads(db).find(filter).sort({ updatedAt: -1, _id: -1 }).limit(query.limit).toArray(),
    leads(db).countDocuments(filter),
  ]);
  return { items: docs.map(toLead), total };
}

/** A regex built from somebody's typing must not be able to be a regex. */
function escapeRx(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export async function getLead(db: Db, id: string): Promise<Lead | null> {
  const doc = await leads(db).findOne({ _id: id });
  return doc ? toLead(doc) : null;
}

/** The marketer's own, or nothing. Somebody else's lead is not theirs to read. */
export async function getLeadFor(db: Db, id: string, reporterId: string): Promise<Lead | null> {
  const doc = await leads(db).findOne({ _id: id, reporterId });
  return doc ? toLead(doc) : null;
}

/** Leads counted by state, for the console's filter row. */
export async function leadCounts(db: Db): Promise<Record<string, number>> {
  const rows = await leads(db)
    .aggregate<{ _id: LeadState; count: number }>([{ $group: { _id: "$state", count: { $sum: 1 } } }])
    .toArray();
  const out: Record<string, number> = {};
  for (const row of rows) out[row._id] = row.count;
  return out;
}

/**
 * Move a lead, with the reason and note that make the move readable later.
 *
 * `won` is refused here and handed to `winLead`, because winning takes an amount
 * and a listing and can fail for reasons that have nothing to do with the lead.
 * Leaving it in this function would give one route two unrelated failure modes.
 */
export async function moveLead(
  db: Db,
  id: string,
  to: LeadState,
  detail: { reason: string; note: string },
  actor: LeadActor,
): Promise<Lead> {
  const doc = await leads(db).findOne({ _id: id });
  if (!doc) throw new NotFoundError(`lead ${id}`);

  if (to === "won") {
    throw new PreconditionFailedError("use_convert", {
      detail: "Marking a buyer as bought needs the amount. Use Convert.",
    });
  }
  if (actor.side === "marketer" && !marketerMayMove(doc.state, to)) {
    throw new PreconditionFailedError("not_yours_to_move", {
      detail: "You can close a buyer you logged. AV Homes moves it through the rest.",
    });
  }

  const refusal = leadMoveRefusal({ from: doc.state, to, ...detail });
  if (refusal) {
    throw new PreconditionFailedError("lead_move_refused", { detail: refusal.message });
  }

  /* Leaving `won` un-mints the money. `cancelDeal` already voids what has not
     been paid and writes a negative line against what has, so this reuses it
     rather than restating the rule a second time and getting it subtly wrong. */
  if (doc.state === "won" && doc.dealId) {
    await cancelDeal(db, doc.dealId, `${detail.reason}. ${detail.note}`, {
      id: actor.id,
      name: actor.name,
    });
  }

  return append(db, doc, to, detail, actor);
}

/** A line on the timeline that moves nothing. Still needs words. */
export async function noteOnLead(
  db: Db,
  id: string,
  note: string,
  actor: LeadActor,
): Promise<Lead> {
  const doc = await leads(db).findOne({ _id: id });
  if (!doc) throw new NotFoundError(`lead ${id}`);
  if (note.trim().length < 4) {
    throw new PreconditionFailedError("note_too_short", { detail: "Say what happened." });
  }
  return append(db, doc, doc.state, { reason: "", note }, actor);
}

export interface WinInput {
  listingId: string;
  listingTitle: string;
  listingLocation: string;
  listingEstate: string;
  listingType: DealKind;
  unitKey: string;
  amountMinor: number;
  closedOn: number;
  reason: string;
  note: string;
}

/**
 * They bought.
 *
 * This mints a `Deal` and approves it in one go, which is what puts the money on
 * the path that already pays marketers: `splitCommission`, a `LedgerLine` per
 * share, and the next pay run. There is deliberately no second commission
 * system for leads. The deal is created as if the marketer had reported it,
 * because as far as the money is concerned they did.
 */
export async function winLead(
  db: Db,
  id: string,
  input: WinInput,
  reporter: Marketer,
  actor: LeadActor,
  settings: MarketingSettings,
): Promise<{ lead: Lead; dealId: string }> {
  const doc = await leads(db).findOne({ _id: id });
  if (!doc) throw new NotFoundError(`lead ${id}`);
  if (doc.state === "won") {
    throw new PreconditionFailedError("already_won", {
      detail: "This buyer is already marked as bought.",
    });
  }
  const refusal = leadMoveRefusal({
    from: doc.state,
    to: "won",
    reason: input.reason,
    note: input.note,
  });
  if (refusal) {
    throw new PreconditionFailedError("lead_move_refused", { detail: refusal.message });
  }
  if (input.amountMinor <= 0) {
    throw new PreconditionFailedError("amount_required", {
      detail: "What did it sell for? The commission is worked out from it.",
    });
  }
  /* A lead with no property attached has nothing to sell, and the money side
     needs a real listing id: an empty one would take the single ("", "") slot
     in the deals uniqueness index and refuse the next listing-less deal on the
     site with a message about somebody else's claim. The console already
     refuses this; so does the server, because the console is not the only
     caller a route has. */
  if (input.listingId.trim() === "") {
    throw new PreconditionFailedError("listing_required", {
      detail: "Attach the property that was sold before marking this bought.",
    });
  }

  const deal = await createDeal(
    db,
    reporter,
    {
      listingId: input.listingId,
      listingTitle: input.listingTitle,
      listingLocation: input.listingLocation,
      listingEstate: input.listingEstate,
      listingType: input.listingType,
      unitKey: input.unitKey,
      amountMinor: input.amountMinor,
      currency: settings.currency,
      buyerName: doc.buyerName,
      buyerPhone: doc.buyerPhone,
      proof: [],
      note: `From a buyer ${reporter.displayName} logged. ${input.note}`.trim(),
      closedOn: input.closedOn,
      leadId: id,
    },
    settings,
  );

  /*
   * Approve it straight away, and CLEAN UP IF THAT FAILS.
   *
   * The commonest failure here is the deals uniqueness index refusing because
   * another marketer is already approved on this listing, which is exactly the
   * rule we want. But `createDeal` has already inserted a `pending` row by this
   * point, and a pending row is not inert: it sits in the console's review
   * queue forever, it adds the whole sale price to the reporter's "pending"
   * figure on their phone, and an admin can approve it by hand later, minting
   * commission for a lead that was never won and that no reversal can reach.
   *
   * So the deal only outlives this function if it was actually approved.
   */
  try {
    await reviewDeal(
      db,
      deal.id,
      {
        status: "approved",
        reason: input.reason,
        amountMinor: input.amountMinor,
        actorId: actor.id,
        actorName: actor.name,
      },
      settings,
    );
  } catch (err) {
    await dropUnapprovedDeal(db, deal.id);
    throw err;
  }

  const lead = await append(
    db,
    doc,
    "won",
    { reason: input.reason, note: input.note },
    actor,
    { dealId: deal.id },
  );
  return { lead, dealId: deal.id };
}

/**
 * Remove a deal this function minted and could not approve.
 *
 * Narrow on purpose: it only ever deletes a row that is still `pending` and
 * still carries no shares, which is the exact state `createDeal` leaves behind
 * and nothing else in the system produces at this point. A deal that somehow
 * reached any other state is left alone and reported, because deleting money
 * somebody may have acted on is worse than an orphan.
 */
async function dropUnapprovedDeal(db: Db, dealId: string): Promise<void> {
  try {
    await collection<DealDoc>(db, COLLECTIONS.marketingDeals).deleteOne({
      _id: dealId,
      status: "pending",
      shares: { $size: 0 },
    });
  } catch {
    // The original failure is the one worth reporting; losing it to a cleanup
    // error would hide why the conversion was refused.
  }
}

/**
 * The one write.
 *
 * Every path above ends here, which is the reason `state` and `events` cannot
 * drift: there is no other place that sets one of them.
 */
async function append(
  db: Db,
  doc: LeadDoc,
  to: LeadState,
  detail: { reason: string; note: string },
  actor: LeadActor,
  extra: Partial<Pick<LeadDoc, "dealId">> = {},
): Promise<Lead> {
  const now = Date.now();
  const event: LeadEvent = {
    at: now,
    from: doc.state,
    to,
    bySide: actor.side,
    byName: actor.name,
    reason: detail.reason,
    note: detail.note.trim(),
  };

  /*
   * COMPARE AND SET on the state we read, not a blind write.
   *
   * Every caller reads the lead, decides, then lands here, and two admins
   * working the same queue will do that at the same time sooner or later. A
   * filter of `{_id}` alone lets both writes through, and the timeline ends up
   * claiming the lead went `new -> viewed` while it was already `contacted`:
   * one admin's decision is silently gone and the chain of events no longer
   * joins up, which is the one thing both surfaces read it for.
   *
   * `resubmitDeal` already settles this the same way, so this is the house
   * rule rather than a new idea.
   */
  const after = await leads(db).findOneAndUpdate(
    { _id: doc._id, state: doc.state },
    { $set: { state: to, updatedAt: now, ...extra }, $push: { events: event } },
    { returnDocument: "after" },
  );

  if (!after) {
    throw new PreconditionFailedError("lead_moved", {
      detail: "Somebody else moved this buyer while you were writing. Open it again.",
    });
  }
  return toLead(after);
}

/**
 * Leads with what this marketer earned on each, for the app's list.
 *
 * One query for every won lead in the page rather than one per row: a marketer
 * with forty won leads would otherwise cost forty round trips to draw a list
 * that is mostly zeroes.
 */
export async function withShares(
  db: Db,
  rows: readonly Lead[],
  marketerId: string,
): Promise<LeadRow[]> {
  const dealIds = rows.map((lead) => lead.dealId).filter((id): id is string => id !== null);
  if (dealIds.length === 0) return rows.map((lead) => ({ ...lead, myShareMinor: 0 }));

  const docs = await collection<DealDoc>(db, COLLECTIONS.marketingDeals)
    .find({ _id: { $in: dealIds } }, { projection: { shares: 1, status: 1 } })
    .toArray();

  const byDeal = new Map<string, number>();
  for (const doc of docs) {
    // A cancelled deal pays nothing, and showing its old share beside a
    // reversed lead would contradict the balance on the money screen.
    if (doc.status !== "approved") continue;
    const share = (doc.shares ?? []).find((line) => line.marketerId === marketerId);
    if (share) byDeal.set(doc._id, share.amountMinor);
  }

  return rows.map((lead) => ({
    ...lead,
    myShareMinor: lead.dealId ? (byDeal.get(lead.dealId) ?? 0) : 0,
  }));
}

/** How many of this marketer's leads are still live, for the app's home card. */
export async function openLeadCount(db: Db, reporterId: string): Promise<number> {
  return leads(db).countDocuments({
    reporterId,
    state: { $in: ["new", "contacted", "meeting", "viewed", "offer"] },
  });
}

export { isLeadOpen };

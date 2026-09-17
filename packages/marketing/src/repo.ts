/**
 * Marketing's data access. Every rule about who earns what lives here.
 *
 * Two invariants hold the whole feature up, and both are enforced in this file
 * rather than in a screen:
 *
 *  - A ledger line is written once. Money that has already been paid is
 *    corrected with a new negative line pointing at the old one, never by
 *    editing what was paid.
 *  - A deal's rates and the three people it pays are frozen the moment an admin
 *    approves it. The tree can be rearranged afterwards and a settled deal still
 *    pays exactly who it said it would.
 */

import type { Db, Filter } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import {
  DuplicateError,
  NotFoundError,
  PreconditionFailedError,
  newId,
} from "@avhomes/core";
import {
  TX_STATE_LABEL,
  formatMoney,
  marketerCode,
  payMonth,
  payMonthLabel,
  splitCommission,
  type ChainMember,
  type Deal,
  type DealKind,
  type DealShare,
  type DealStatus,
  type LedgerLine,
  type LedgerStatus,
  type Marketer,
  type MarketerAlert,
  type MarketerAlertTone,
  type MarketerBalance,
  type MarketerBank,
  type MarketerStatus,
  type MarketingSettings,
  type MarketingUpdate,
  type MarketingUpdateStatus,
  type MarketingUpdateTone,
  type PayIssue,
  type PayRun,
  type TeamMember,
  type Transaction,
  type TxState,
} from "@avhomes/contracts";
import {
  toDeal,
  toLedgerLine,
  toMarketer,
  toMarketingUpdate,
  toPayIssue,
  toPayRun,
  type DealDoc,
  type IssueDoc,
  type LedgerDoc,
  type MarketerDoc,
  type PayRunDoc,
  type PayRunItemDoc,
  type UpdateDoc,
} from "./schema";

function marketers(db: Db) {
  return collection<MarketerDoc>(db, COLLECTIONS.marketers);
}
function deals(db: Db) {
  return collection<DealDoc>(db, COLLECTIONS.marketingDeals);
}
function ledger(db: Db) {
  return collection<LedgerDoc>(db, COLLECTIONS.marketingLedger);
}
function payRuns(db: Db) {
  return collection<PayRunDoc>(db, COLLECTIONS.marketingPayRuns);
}
function issues(db: Db) {
  return collection<IssueDoc>(db, COLLECTIONS.marketingIssues);
}
function updates(db: Db) {
  return collection<UpdateDoc>(db, COLLECTIONS.marketingUpdates);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Caller-supplied text becomes a literal in a regex, never a pattern. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/* ══════════════════════════════════════════════════════════════ MARKETERS ══ */

export interface JoinInput {
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  state: string;
  /** The code on the invite link, or empty when they came on their own. */
  referrerCode: string;
  bank: MarketerBank | null;
  isAdmin: boolean;
}

/**
 * The account everything falls back to.
 *
 * The first marketer created, which is the founder: a marketer who joins with
 * no link sits under them, and so does anybody orphaned by a ban.
 */
export async function rootMarketer(db: Db): Promise<MarketerDoc | null> {
  return marketers(db).findOne({}, { sort: { seq: 1 } });
}

export async function findMarketerByUser(db: Db, userId: string): Promise<Marketer | null> {
  const doc = await marketers(db).findOne({ userId });
  return doc ? toMarketer(doc) : null;
}

export async function findMarketerById(db: Db, id: string): Promise<Marketer | null> {
  const doc = await marketers(db).findOne({ _id: id });
  return doc ? toMarketer(doc) : null;
}

export async function findMarketerByCode(db: Db, code: string): Promise<Marketer | null> {
  const doc = await marketers(db).findOne({ code: code.toUpperCase() });
  return doc ? toMarketer(doc) : null;
}

/** The next free number. A code is never reused, so this only climbs. */
async function nextSeq(db: Db): Promise<number> {
  const top = await marketers(db).findOne({}, { sort: { seq: -1 }, projection: { seq: 1 } });
  return (top?.seq ?? 0) + 1;
}

function uplineFor(parent: MarketerDoc | null): string[] {
  if (!parent) return [];
  // Nearest first, capped at two: the parent and the parent's parent.
  return [parent._id, ...(parent.upline ?? [])].slice(0, 2);
}

export async function createMarketer(db: Db, input: JoinInput): Promise<Marketer> {
  const now = Date.now();
  const existing = await marketers(db).findOne({ userId: input.userId });
  if (existing) return toMarketer(existing);

  const referrer = input.referrerCode
    ? await marketers(db).findOne({ code: input.referrerCode.toUpperCase() })
    : null;
  const root = await rootMarketer(db);
  // A link from somebody paused or banned is not a link: they fall to the root.
  const parent = referrer && referrer.status === "active" ? referrer : root;

  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = await nextSeq(db);
    const doc: MarketerDoc = {
      _id: newId("mkt", now),
      userId: input.userId,
      code: marketerCode(seq),
      seq,
      displayName: input.displayName,
      email: input.email,
      phone: input.phone,
      state: input.state,
      status: "active",
      statusReason: "",
      statusAt: null,
      parentId: parent?._id ?? null,
      upline: uplineFor(parent),
      bank: input.bank,
      isAdmin: input.isAdmin,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await marketers(db).insertOne(doc);
      return toMarketer(doc);
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      // The app's first screen fires several reads at once and each one arrives
      // here with no profile yet. The unique index on userId lets exactly one
      // insert win, and every other request answers with the winner's row
      // rather than a second copy of the same person.
      const winner = await marketers(db).findOne({ userId: input.userId });
      if (winner) return toMarketer(winner);
      // Otherwise two different people took the same number at once: next one.
      if (attempt < 4) continue;
      throw err;
    }
  }
  throw new DuplicateError("code", "marketer code");
}

/** The chain that gets paid: the marketer, then the two above them. */
export async function chainFor(db: Db, marketerId: string): Promise<(ChainMember | null)[]> {
  const self = await marketers(db).findOne({ _id: marketerId });
  if (!self) return [null, null, null];
  const uplineIds = self.upline ?? [];
  const above = uplineIds.length
    ? await marketers(db)
        .find({ _id: { $in: uplineIds } })
        .toArray()
    : [];
  const member = (doc: MarketerDoc | undefined | null): ChainMember | null =>
    doc ? { id: doc._id, name: doc.displayName, code: doc.code, status: doc.status } : null;

  return [
    member(self),
    member(above.find((row) => row._id === uplineIds[0])),
    member(above.find((row) => row._id === uplineIds[1])),
  ];
}

export interface TeamSummary {
  levels: [number, number, number];
  members: TeamMember[];
}

/** The three levels under one marketer, with a deal count per person. */
export async function teamFor(db: Db, marketerId: string): Promise<TeamSummary> {
  const level1 = await marketers(db)
    .find({ parentId: marketerId })
    .sort({ createdAt: -1 })
    .limit(300)
    .toArray();
  const level1Ids = level1.map((row) => row._id);
  const level2 = level1Ids.length
    ? await marketers(db)
        .find({ parentId: { $in: level1Ids } })
        .sort({ createdAt: -1 })
        .limit(600)
        .toArray()
    : [];
  const level2Ids = level2.map((row) => row._id);
  const level3 = level2Ids.length
    ? await marketers(db)
        .find({ parentId: { $in: level2Ids } })
        .sort({ createdAt: -1 })
        .limit(900)
        .toArray()
    : [];

  const all = [...level1, ...level2, ...level3];
  const dealCounts = new Map<string, number>();
  if (all.length > 0) {
    const counts = await deals(db)
      .aggregate<{ _id: string; count: number }>([
        { $match: { reporterId: { $in: all.map((row) => row._id) }, status: "approved" } },
        { $group: { _id: "$reporterId", count: { $sum: 1 } } },
      ])
      .toArray();
    for (const row of counts) dealCounts.set(row._id, row.count);
  }

  const nameById = new Map(all.map((row) => [row._id, row.displayName]));
  const teamCount = (id: string) =>
    level2.filter((row) => row.parentId === id).length +
    level3.filter((row) => level2.some((mid) => mid._id === row.parentId && mid.parentId === id)).length;

  const row = (doc: MarketerDoc, level: 1 | 2 | 3, underName: string): TeamMember => ({
    id: doc._id,
    code: doc.code,
    displayName: doc.displayName,
    level,
    status: doc.status,
    joinedAt: doc.joinedAt ?? doc.createdAt,
    teamCount: level === 1 ? teamCount(doc._id) : 0,
    dealCount: dealCounts.get(doc._id) ?? 0,
    underName,
  });

  const members: TeamMember[] = [
    ...level1.map((doc) => row(doc, 1, "")),
    ...level2.map((doc) => row(doc, 2, nameById.get(doc.parentId ?? "") ?? "")),
    ...level3.map((doc) => row(doc, 3, nameById.get(doc.parentId ?? "") ?? "")),
  ];

  return { levels: [level1.length, level2.length, level3.length], members };
}

export interface MarketerListQuery {
  status?: MarketerStatus;
  q?: string;
  limit: number;
}

export async function listMarketers(
  db: Db,
  query: MarketerListQuery,
): Promise<{ items: Marketer[]; total: number }> {
  const filter: Filter<MarketerDoc> = {};
  if (query.status) filter.status = query.status;
  if (query.q && query.q.trim() !== "") {
    const rx = new RegExp(escapeRegex(query.q.trim()), "iu");
    Object.assign(filter, {
      $or: [{ displayName: rx }, { code: rx }, { email: rx }, { phone: rx }],
    });
  }
  const [docs, total] = await Promise.all([
    marketers(db).find(filter).sort({ createdAt: -1, _id: -1 }).limit(query.limit).toArray(),
    marketers(db).countDocuments(filter),
  ]);
  return { items: docs.map(toMarketer), total };
}

/**
 * Pause, ban or bring somebody back.
 *
 * A ban moves everyone they invited to the root account and rewrites the chain
 * for the two levels below, so nobody under a banned marketer loses their place.
 * A pause leaves the tree alone: it is meant to be undone.
 */
export async function setMarketerStatus(
  db: Db,
  id: string,
  status: MarketerStatus,
  reason: string,
): Promise<Marketer> {
  const now = Date.now();
  const doc = await marketers(db).findOne({ _id: id });
  if (!doc) throw new NotFoundError(`marketer ${id}`);

  const root = await rootMarketer(db);
  if (status === "banned" && root && root._id === id) {
    throw new PreconditionFailedError("root_marketer", {
      detail: "This is the founder account. It cannot be banned.",
    });
  }

  await marketers(db).updateOne(
    { _id: id },
    { $set: { status, statusReason: reason, statusAt: now, updatedAt: now } },
  );

  if (status === "banned" && root) {
    const children = await marketers(db).find({ parentId: id }).toArray();
    for (const child of children) {
      await marketers(db).updateOne(
        { _id: child._id },
        { $set: { parentId: root._id, upline: uplineFor(root), updatedAt: now } },
      );
      const grandchildren = await marketers(db).find({ parentId: child._id }).toArray();
      for (const grandchild of grandchildren) {
        await marketers(db).updateOne(
          { _id: grandchild._id },
          {
            $set: {
              upline: [child._id, root._id].slice(0, 2),
              updatedAt: now,
            },
          },
        );
        // Level 3 under the moved child now hangs two below the root, which is
        // the deepest this tree goes. Their own chain is the grandchild then
        // the child; nothing below them earns.
        await marketers(db).updateMany(
          { parentId: grandchild._id },
          { $set: { upline: [grandchild._id, child._id], updatedAt: now } },
        );
      }
    }
  }

  const after = await marketers(db).findOne({ _id: id });
  return toMarketer(after as MarketerDoc);
}

export async function updateMarketerBank(
  db: Db,
  id: string,
  bank: MarketerBank,
): Promise<Marketer> {
  const now = Date.now();
  const after = await marketers(db).findOneAndUpdate(
    { _id: id },
    { $set: { bank, updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError(`marketer ${id}`);
  return toMarketer(after);
}

export async function updateMarketerProfile(
  db: Db,
  id: string,
  patch: { displayName?: string; phone?: string; state?: string },
): Promise<Marketer> {
  const now = Date.now();
  const set: Record<string, unknown> = { updatedAt: now };
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.state !== undefined) set.state = patch.state;
  const after = await marketers(db).findOneAndUpdate(
    { _id: id },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError(`marketer ${id}`);
  return toMarketer(after);
}

/* ══════════════════════════════════════════════════════════════════ DEALS ══ */

export interface DealInput {
  listingId: string;
  listingTitle: string;
  listingLocation: string;
  listingEstate: string;
  listingType: DealKind;
  unitKey: string;
  amountMinor: number;
  currency: string;
  buyerName: string;
  buyerPhone: string;
  proof: string[];
  note: string;
  closedOn: number;
  /** Set when a won lead minted this deal. */
  leadId?: string | null;
}

/** Somebody else already has this listing settled or waiting. */
export async function claimOn(db: Db, listingId: string, unitKey: string): Promise<Deal | null> {
  const doc = await deals(db).findOne({
    listingId,
    unitKey,
    status: { $in: ["pending", "approved"] },
  });
  return doc ? toDeal(doc) : null;
}

export async function createDeal(
  db: Db,
  reporter: Marketer,
  input: DealInput,
  settings: MarketingSettings,
): Promise<Deal> {
  const now = Date.now();

  if (settings.blockSelfDeals && input.buyerPhone.trim() !== "") {
    const digits = input.buyerPhone.replace(/[^0-9]/gu, "").slice(-10);
    if (digits !== "" && reporter.phone.replace(/[^0-9]/gu, "").endsWith(digits)) {
      throw new PreconditionFailedError("self_deal", {
        detail: "That buyer's number is your own. A marketer cannot earn on their own purchase.",
      });
    }
  }

  const doc: DealDoc = {
    _id: newId("deal", now),
    listingId: input.listingId,
    listingTitle: input.listingTitle,
    listingLocation: input.listingLocation,
    listingEstate: input.listingEstate,
    listingType: input.listingType,
    unitKey: input.unitKey,
    amountMinor: input.amountMinor,
    currency: input.currency,
    buyerName: input.buyerName,
    buyerPhone: input.buyerPhone,
    proof: input.proof,
    note: input.note,
    reporterId: reporter.id,
    reporterName: reporter.displayName,
    reporterCode: reporter.code,
    leadId: input.leadId ?? null,
    status: "pending",
    reason: "",
    reviewedBy: "",
    reviewedByName: "",
    reviewedAt: null,
    closedOn: input.closedOn || now,
    shares: [],
    createdAt: now,
    updatedAt: now,
  };
  await deals(db).insertOne(doc);
  return toDeal(doc);
}

export interface DealListQuery {
  status?: DealStatus;
  reporterId?: string;
  /** Deals anybody in this marketer's team closed, including their own. */
  sharedWith?: string;
  q?: string;
  limit: number;
}

export async function listDeals(
  db: Db,
  query: DealListQuery,
): Promise<{ items: Deal[]; total: number }> {
  const filter: Filter<DealDoc> = {};
  if (query.status) filter.status = query.status;
  if (query.reporterId) filter.reporterId = query.reporterId;
  if (query.sharedWith) {
    Object.assign(filter, {
      $or: [{ reporterId: query.sharedWith }, { "shares.marketerId": query.sharedWith }],
    });
  }
  if (query.q && query.q.trim() !== "") {
    const rx = new RegExp(escapeRegex(query.q.trim()), "iu");
    Object.assign(filter, {
      $and: [
        ...(filter.$or ? [{ $or: filter.$or }] : []),
        { $or: [{ listingTitle: rx }, { reporterName: rx }, { buyerName: rx }] },
      ],
    });
    delete filter.$or;
  }
  const [docs, total] = await Promise.all([
    deals(db).find(filter).sort({ createdAt: -1, _id: -1 }).limit(query.limit).toArray(),
    deals(db).countDocuments(filter),
  ]);
  return { items: docs.map(toDeal), total };
}

export async function getDeal(db: Db, id: string): Promise<Deal | null> {
  const doc = await deals(db).findOne({ _id: id });
  return doc ? toDeal(doc) : null;
}

/**
 * A deal one marketer may open: one they reported or one that pays them.
 *
 * Null for every other deal, so the route answers a stranger's id exactly as it
 * answers an id that does not exist.
 */
export async function getDealFor(db: Db, id: string, marketerId: string): Promise<Deal | null> {
  const doc = await deals(db).findOne({
    _id: id,
    $or: [{ reporterId: marketerId }, { "shares.marketerId": marketerId }],
  });
  return doc ? toDeal(doc) : null;
}

/**
 * The marketer answers "Need more info".
 *
 * The proof is replaced rather than added to, because what was sent first is
 * what the admin already said was not enough. The note is appended, so the
 * admin reads the whole exchange in one place. Back to `pending`, and the admin's
 * reason stays on the deal: it is the question this answers.
 */
export async function resubmitDeal(
  db: Db,
  id: string,
  reporter: Marketer,
  input: { proof: string[]; note: string },
): Promise<Deal> {
  const now = Date.now();
  const doc = await deals(db).findOne({ _id: id, reporterId: reporter.id });
  if (!doc) throw new NotFoundError(`deal ${id}`);
  const refused = new PreconditionFailedError("deal_not_waiting", {
    detail: "This deal is not waiting on anything from you, so there is nothing to send.",
  });
  if (doc.status !== "info") throw refused;

  const previous = (doc.note ?? "").trim();
  const added = input.note.trim();
  const note = added === "" ? previous : previous === "" ? added : `${previous}\n\n${added}`;

  const after = await deals(db).findOneAndUpdate(
    // The status in the filter is the guard. An admin deciding the deal in the
    // same moment wins, and this write matches nothing.
    { _id: id, reporterId: reporter.id, status: "info" },
    { $set: { status: "pending", proof: input.proof, note, updatedAt: now } },
    { returnDocument: "after" },
  );
  if (!after) throw refused;
  return toDeal(after);
}

/** What each level would earn if this deal were approved at this amount. */
export async function previewShares(
  db: Db,
  deal: Deal,
  amountMinor: number,
  settings: MarketingSettings,
): Promise<DealShare[]> {
  const chain = await chainFor(db, deal.reporterId);
  const rates = deal.listingType === "rent" ? settings.rentRates : settings.saleRates;
  return splitCommission(amountMinor, rates, chain).map((line) => ({
    marketerId: line.marketerId,
    marketerName: line.marketerName,
    code: line.code,
    level: line.level,
    rate: line.rate,
    amountMinor: line.amountMinor,
  }));
}

export interface ReviewInput {
  status: Extract<DealStatus, "approved" | "rejected" | "info">;
  reason: string;
  /** The admin can correct the amount before approving. */
  amountMinor?: number;
  actorId: string;
  actorName: string;
}

/**
 * Settle a deal.
 *
 * Approving is the only place a ledger line is born. The shares are worked out
 * here, from the rates as they stand right now and the chain as it stands right
 * now, and then written onto the deal so the answer never changes again.
 */
export async function reviewDeal(
  db: Db,
  id: string,
  input: ReviewInput,
  settings: MarketingSettings,
): Promise<Deal> {
  const now = Date.now();
  const doc = await deals(db).findOne({ _id: id });
  if (!doc) throw new NotFoundError(`deal ${id}`);
  if (doc.status === "approved") {
    throw new PreconditionFailedError("already_settled", {
      detail: "This deal was already approved. Cancel it first if it fell through.",
    });
  }

  const amountMinor = input.amountMinor ?? doc.amountMinor;

  if (input.status !== "approved") {
    const after = await deals(db).findOneAndUpdate(
      { _id: id },
      {
        $set: {
          status: input.status,
          reason: input.reason,
          reviewedBy: input.actorId,
          reviewedByName: input.actorName,
          reviewedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    return toDeal(after as DealDoc);
  }

  const chain = await chainFor(db, doc.reporterId);
  const rates = doc.listingType === "rent" ? settings.rentRates : settings.saleRates;
  const shares = splitCommission(amountMinor, rates, chain).map((line) => ({
    marketerId: line.marketerId,
    marketerName: line.marketerName,
    code: line.code,
    level: line.level,
    rate: line.rate,
    amountMinor: line.amountMinor,
  }));

  try {
    await deals(db).updateOne(
      { _id: id },
      {
        $set: {
          status: "approved",
          amountMinor,
          reason: input.reason,
          shares,
          reviewedBy: input.actorId,
          reviewedByName: input.actorName,
          reviewedAt: now,
          updatedAt: now,
        },
      },
    );
  } catch (err) {
    // The partial unique index refused: another deal on this listing is already
    // approved. That is the duplicate claim rule, reported as what it is.
    if ((err as { code?: number }).code === 11000) {
      throw new PreconditionFailedError("listing_already_settled", {
        detail: "Another marketer has already been approved for this listing.",
      });
    }
    throw err;
  }

  if (shares.length > 0) {
    const lines: LedgerDoc[] = shares.map((share, index) => ({
      _id: newId("ledg", now + index),
      marketerId: share.marketerId,
      dealId: id,
      level: share.level,
      kind: "earn" as const,
      amountMinor: share.amountMinor,
      currency: doc.currency,
      status: "earned" as const,
      payRunId: null,
      reversesId: null,
      note: "",
      dealTitle: doc.listingTitle,
      createdAt: now,
      updatedAt: now,
    }));
    await ledger(db).insertMany(lines);
  }

  const after = await deals(db).findOne({ _id: id });
  return toDeal(after as DealDoc);
}

/**
 * The deal fell through.
 *
 * Money that has not been paid is voided. Money that has been paid gets a
 * negative line, which the next pay run subtracts. Nothing is deleted either
 * way, so the marketer's history still shows what happened and why.
 */
export async function cancelDeal(
  db: Db,
  id: string,
  reason: string,
  actor: { id: string; name: string },
): Promise<Deal> {
  const now = Date.now();

  /*
   * CANCELLING TWICE MUST NOT CHARGE TWICE.
   *
   * The paid branch below writes a NEW negative line and leaves the paid line
   * exactly as it was, which is correct: a paid line is history. But it means
   * running this function again finds the same paid line and writes a second
   * clawback, so a marketer is docked twice for one commission. There are three
   * real ways to arrive here twice, and none of them is exotic: an admin
   * cancels a deal and then reverses the lead that minted it, two admins
   * reverse the same won lead at once, or somebody retries after a timeout.
   *
   * The claim on the deal row is what makes this safe. Only the caller that
   * moves it out of `cancelled` does the work; anybody else gets the already
   * cancelled deal back and writes nothing.
   */
  const claimed = await deals(db).findOneAndUpdate(
    { _id: id, status: { $ne: "cancelled" } },
    {
      $set: {
        status: "cancelled",
        reason,
        reviewedBy: actor.id,
        reviewedByName: actor.name,
        reviewedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );

  /*
   * A caller that did NOT win the claim still walks the ledger below.
   *
   * Returning early here would be the other half of the same bug: if the first
   * caller marked the deal cancelled and then died before finishing the ledger,
   * the money would never come back and every retry would no-op. The loop is
   * safe to repeat because each branch checks its own work first, so re-running
   * it is how a half-finished cancel completes.
   */
  const doc = claimed ?? (await deals(db).findOne({ _id: id }));
  if (!doc) throw new NotFoundError(`deal ${id}`);

  const lines = await ledger(db).find({ dealId: id, kind: "earn" }).toArray();
  for (const line of lines) {
    if (line.status === "paid") {
      /* Belt and braces behind the claim: if a clawback already points at this
         line, the money has been taken back and must not be taken again. */
      const reversed = await ledger(db).findOne({ reversesId: line._id, kind: "clawback" });
      if (reversed) continue;
      await ledger(db).insertOne({
        _id: newId("ledg", now),
        marketerId: line.marketerId,
        dealId: id,
        level: line.level,
        kind: "clawback",
        amountMinor: -Math.abs(line.amountMinor),
        currency: line.currency,
        status: "earned",
        payRunId: null,
        reversesId: line._id,
        note: reason || "Deal cancelled after payment",
        dealTitle: line.dealTitle,
        createdAt: now,
        updatedAt: now,
      });
    } else if (line.status !== "void") {
      await ledger(db).updateOne(
        { _id: line._id },
        { $set: { status: "void", note: reason || "Deal cancelled", updatedAt: now } },
      );
    }
  }

  const after = await deals(db).findOne({ _id: id });
  return toDeal(after as DealDoc);
}

/* ═════════════════════════════════════════════════════════════════ LEDGER ══ */

export async function balanceFor(
  db: Db,
  marketerId: string,
  currency: string,
): Promise<MarketerBalance> {
  const [sums, pending] = await Promise.all([
    ledger(db)
      .aggregate<{ _id: string; total: number }>([
        { $match: { marketerId, status: { $ne: "void" } } },
        { $group: { _id: "$status", total: { $sum: "$amountMinor" } } },
      ])
      .toArray(),
    deals(db)
      .aggregate<{ _id: null; total: number }>([
        { $match: { reporterId: marketerId, status: "pending" } },
        { $group: { _id: null, total: { $sum: "$amountMinor" } } },
      ])
      .toArray(),
  ]);

  const by = new Map(sums.map((row) => [row._id, row.total]));
  // A deal being checked is not money yet. What it WOULD pay is worked out on
  // the screen from the rates; the amount here is the deal's own value.
  return {
    currency,
    waitingMinor: by.get("earned") ?? 0,
    scheduledMinor: by.get("scheduled") ?? 0,
    paidMinor: by.get("paid") ?? 0,
    pendingMinor: pending[0]?.total ?? 0,
  };
}

export async function listLedger(
  db: Db,
  marketerId: string,
  limit: number,
): Promise<LedgerLine[]> {
  const docs = await ledger(db)
    .find({ marketerId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toLedgerLine);
}

/* ═══════════════════════════════════════════════════════════════ PAY RUNS ══ */

/** The moment after which an approval waits for next month's run. */
function cutoffFor(month: string, day: number): number {
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) return Date.now();
  // End of the cutoff day, local to the server, which is where `payMonth` also
  // reads its month from.
  return new Date(year, mon - 1, day, 23, 59, 59, 999).getTime();
}

export async function getPayRun(db: Db, id: string): Promise<PayRun | null> {
  const doc = await payRuns(db).findOne({ _id: id });
  return doc ? toPayRun(doc) : null;
}

export async function listPayRuns(db: Db, limit: number): Promise<PayRun[]> {
  const docs = await payRuns(db).find({}).sort({ month: -1 }).limit(limit).toArray();
  return docs.map(toPayRun);
}

/**
 * Prepare a month's payments.
 *
 * Everything earned up to the cutoff is gathered per marketer, clawbacks
 * included, and the total is what one bank transfer will be. A marketer whose
 * total comes out at or below zero is left out and their lines stay open, so a
 * clawback carries into next month instead of quietly disappearing.
 */
export async function buildPayRun(
  db: Db,
  month: string,
  settings: MarketingSettings,
  actorName: string,
): Promise<PayRun> {
  const now = Date.now();
  const existing = await payRuns(db).findOne({ month });
  if (existing && existing.status !== "draft") {
    throw new PreconditionFailedError("pay_run_closed", {
      detail: `The ${month} pay run has already been started.`,
    });
  }

  const cutoff = Math.min(cutoffFor(month, settings.payCutoffDay), now);
  const open = await ledger(db)
    .find({ status: "earned", createdAt: { $lte: cutoff } })
    .toArray();

  const totals = new Map<string, number>();
  for (const line of open) {
    totals.set(line.marketerId, (totals.get(line.marketerId) ?? 0) + line.amountMinor);
  }

  const ids = [...totals.keys()];
  const people = ids.length ? await marketers(db).find({ _id: { $in: ids } }).toArray() : [];
  const items: PayRunItemDoc[] = [];
  const payable: string[] = [];

  for (const person of people) {
    const total = totals.get(person._id) ?? 0;
    if (total <= 0 || total < settings.minPayoutMinor) continue;
    if (person.status === "banned") continue;
    items.push({
      marketerId: person._id,
      code: person.code,
      displayName: person.displayName,
      totalMinor: total,
      // Copied, not referenced: a bank change tomorrow must not move today's
      // prepared payment.
      bank: person.bank ?? null,
      status: "pending",
      proof: [],
      reference: "",
      paidAt: null,
      paidByName: "",
      issueId: null,
      note: "",
    });
    payable.push(person._id);
  }

  items.sort((a, b) => b.totalMinor - a.totalMinor);
  const totalMinor = items.reduce((sum, item) => sum + item.totalMinor, 0);

  const id = existing?._id ?? newId("prun", now);
  const doc: PayRunDoc = {
    _id: id,
    month,
    status: "draft",
    currency: settings.currency,
    totalMinor,
    paidMinor: 0,
    items,
    createdByName: actorName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    closedAt: null,
  };
  await payRuns(db).replaceOne({ _id: id }, doc, { upsert: true });

  // Anything previously attached to this draft and no longer in it goes back to
  // open, so rebuilding a draft is safe.
  await ledger(db).updateMany(
    { payRunId: id, status: "scheduled" },
    { $set: { status: "earned", payRunId: null, updatedAt: now } },
  );
  if (payable.length > 0) {
    await ledger(db).updateMany(
      { status: "earned", createdAt: { $lte: cutoff }, marketerId: { $in: payable } },
      { $set: { status: "scheduled", payRunId: id, updatedAt: now } },
    );
  }

  return toPayRun(doc);
}

export async function markPayItem(
  db: Db,
  runId: string,
  marketerId: string,
  input: { proof: string[]; reference: string; paidByName: string },
): Promise<PayRun> {
  const now = Date.now();
  const run = await payRuns(db).findOne({ _id: runId });
  if (!run) throw new NotFoundError(`pay run ${runId}`);
  const item = run.items.find((row) => row.marketerId === marketerId);
  if (!item) throw new NotFoundError(`marketer ${marketerId} in pay run ${runId}`);
  if (item.status === "paid") return toPayRun(run);

  await payRuns(db).updateOne(
    { _id: runId, "items.marketerId": marketerId },
    {
      $set: {
        status: run.status === "draft" ? "paying" : run.status,
        "items.$.status": "paid",
        "items.$.proof": input.proof,
        "items.$.reference": input.reference,
        "items.$.paidAt": now,
        "items.$.paidByName": input.paidByName,
        updatedAt: now,
      },
      $inc: { paidMinor: item.totalMinor },
    },
  );

  await ledger(db).updateMany(
    { payRunId: runId, marketerId, status: "scheduled" },
    { $set: { status: "paid", updatedAt: now } },
  );

  const after = await payRuns(db).findOne({ _id: runId });
  return toPayRun(after as PayRunDoc);
}

/** Take somebody out of a run: their money goes back to waiting. */
export async function holdPayItem(
  db: Db,
  runId: string,
  marketerId: string,
  note: string,
): Promise<PayRun> {
  const now = Date.now();
  await payRuns(db).updateOne(
    { _id: runId, "items.marketerId": marketerId },
    { $set: { "items.$.status": "held", "items.$.note": note, updatedAt: now } },
  );
  await ledger(db).updateMany(
    { payRunId: runId, marketerId, status: "scheduled" },
    { $set: { status: "earned", payRunId: null, updatedAt: now } },
  );
  const after = await payRuns(db).findOne({ _id: runId });
  if (!after) throw new NotFoundError(`pay run ${runId}`);
  return toPayRun(after);
}

export async function closePayRun(db: Db, runId: string): Promise<PayRun> {
  const now = Date.now();
  const run = await payRuns(db).findOne({ _id: runId });
  if (!run) throw new NotFoundError(`pay run ${runId}`);
  const unpaid = run.items.filter((item) => item.status === "pending");
  if (unpaid.length > 0) {
    throw new PreconditionFailedError("pay_run_incomplete", {
      detail: `${unpaid.length} ${unpaid.length === 1 ? "person has" : "people have"} not been paid yet. Mark them paid or hold them first.`,
    });
  }
  await payRuns(db).updateOne(
    { _id: runId },
    { $set: { status: "closed", closedAt: now, updatedAt: now } },
  );
  const after = await payRuns(db).findOne({ _id: runId });
  return toPayRun(after as PayRunDoc);
}

/** Every payment a marketer has ever been part of, newest first. */
export async function payHistoryFor(db: Db, marketerId: string, limit: number): Promise<
  {
    payRunId: string;
    month: string;
    totalMinor: number;
    currency: string;
    status: string;
    paidAt: number | null;
    proof: string[];
    reference: string;
    issueId: string | null;
    bankLabel: string;
  }[]
> {
  const runs = await payRuns(db)
    .find({ "items.marketerId": marketerId })
    .sort({ month: -1 })
    .limit(limit)
    .toArray();
  const out = [];
  for (const run of runs) {
    const item = run.items.find((row) => row.marketerId === marketerId);
    if (!item) continue;
    out.push({
      payRunId: run._id,
      month: run.month,
      totalMinor: item.totalMinor,
      currency: run.currency,
      status: item.status,
      paidAt: item.paidAt ?? null,
      proof: item.proof ?? [],
      reference: item.reference ?? "",
      issueId: item.issueId ?? null,
      bankLabel: item.bank ? `${item.bank.bankName} ${item.bank.accountNumber.slice(-4)}` : "",
    });
  }
  return out;
}

/**
 * The marketer's statement: every money event, newest first.
 *
 * Two sources merged, and the merge is the reason this function exists rather
 * than the screen doing it: the two collections sort on different fields, so a
 * naive concat interleaves wrongly at the boundary and the list reads as
 * out of order exactly where a reader is looking hardest.
 *
 * Every row names its kind. An earning and the payout that later carries it are
 * both money arriving from the marketer's side, so both are positive, and the
 * label is what stops that reading as being paid twice.
 */
export async function statementFor(
  db: Db,
  marketerId: string,
  limit: number,
): Promise<Transaction[]> {
  const [lines, payments] = await Promise.all([
    listLedger(db, marketerId, limit),
    payHistoryFor(db, marketerId, 48),
  ]);

  /* Which pay run carried each commission, so an earning row can say so in
     words. Without it the statement shows the same naira twice, both green and
     both positive, and the only defence is a 12px label the reader has to
     interpret. */
  const monthOfRun = new Map(payments.map((pay) => [pay.payRunId, payMonthLabel(pay.month)]));
  const paidRuns = new Set(payments.filter((pay) => pay.status === "paid").map((p) => p.payRunId));

  const rows: Transaction[] = lines.map((line) => {
    const state = LEDGER_STATE[line.status];
    const run = line.payRunId;
    return {
      id: line.id,
      at: line.createdAt,
      amountMinor: line.amountMinor,
      currency: line.currency,
      kind:
        line.kind === "clawback" ? "clawback" : line.kind === "adjust" ? "adjustment" : "earning",
      title: line.dealTitle || (line.kind === "adjust" ? "Adjustment" : "Commission"),
      state,
      status: TX_STATE_LABEL[state],
      reference: line.id,
      dealId: line.dealId,
      payRunId: run,
      bankLabel: "",
      carriedBy: run && paidRuns.has(run) ? (monthOfRun.get(run) ?? "") : "",
      note: line.note,
    };
  });

  for (const pay of payments) {
    // Only a transfer that actually went out. A pending row is a promise, and
    // it is already on the money screen as "on the way".
    if (pay.status !== "paid" || pay.paidAt === null) continue;
    rows.push({
      id: `${pay.payRunId}:${marketerId}`,
      at: pay.paidAt,
      amountMinor: pay.totalMinor,
      currency: pay.currency,
      kind: "payout",
      title: `${payMonthLabel(pay.month)} payout`,
      state: "settled",
      status: TX_STATE_LABEL.settled,
      reference: pay.reference,
      dealId: null,
      payRunId: pay.payRunId,
      bankLabel: pay.bankLabel,
      carriedBy: "",
      note: "",
    });
  }

  rows.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
  return rows;
}

/** The ledger's own states, as the statement's own states. */
const LEDGER_STATE: Record<LedgerStatus, TxState> = {
  earned: "waiting",
  scheduled: "sending",
  paid: "settled",
  void: "cancelled",
};

/* ═══════════════════════════════════════════════════════ PAYMENT PROBLEMS ══ */

export async function openIssue(
  db: Db,
  marketer: Marketer,
  payRunId: string,
  text: string,
  settings: MarketingSettings,
): Promise<PayIssue> {
  const now = Date.now();
  const run = await payRuns(db).findOne({ _id: payRunId });
  if (!run) throw new NotFoundError(`pay run ${payRunId}`);
  const item = run.items.find((row) => row.marketerId === marketer.id);
  if (!item || item.status !== "paid" || item.paidAt === null) {
    throw new PreconditionFailedError("not_paid_yet", {
      detail: "This payment has not been sent yet, so there is nothing to report.",
    });
  }
  const windowMs = settings.issueWindowDays * 24 * 60 * 60 * 1000;
  if (now - item.paidAt > windowMs) {
    throw new PreconditionFailedError("issue_window_closed", {
      detail: `A payment can only be reported within ${settings.issueWindowDays} days. Call AV Homes instead.`,
    });
  }
  if (item.issueId) {
    const open = await issues(db).findOne({ _id: item.issueId });
    if (open) return toPayIssue(open);
  }

  const doc: IssueDoc = {
    _id: newId("pisu", now),
    payRunId,
    month: run.month,
    marketerId: marketer.id,
    marketerName: marketer.displayName,
    code: marketer.code,
    amountMinor: item.totalMinor,
    currency: run.currency,
    status: "open",
    messages: [
      {
        at: now,
        byName: marketer.displayName,
        bySide: "marketer",
        text: text || "I did not get this money.",
        proof: [],
      },
    ],
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
  };
  await issues(db).insertOne(doc);
  await payRuns(db).updateOne(
    { _id: payRunId, "items.marketerId": marketer.id },
    { $set: { "items.$.issueId": doc._id, updatedAt: now } },
  );
  return toPayIssue(doc);
}

export async function listIssues(
  db: Db,
  query: { status?: "open" | "resolved"; marketerId?: string; limit: number },
): Promise<PayIssue[]> {
  const filter: Filter<IssueDoc> = {};
  if (query.status) filter.status = query.status;
  if (query.marketerId) filter.marketerId = query.marketerId;
  const docs = await issues(db)
    .find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.limit)
    .toArray();
  return docs.map(toPayIssue);
}

export async function getIssue(db: Db, id: string): Promise<PayIssue | null> {
  const doc = await issues(db).findOne({ _id: id });
  return doc ? toPayIssue(doc) : null;
}

export async function replyToIssue(
  db: Db,
  id: string,
  message: { byName: string; bySide: "marketer" | "admin"; text: string; proof: string[] },
): Promise<PayIssue> {
  const now = Date.now();
  const after = await issues(db).findOneAndUpdate(
    { _id: id },
    {
      $push: { messages: { at: now, ...message } },
      $set: { updatedAt: now },
    },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError(`payment problem ${id}`);
  return toPayIssue(after);
}

export async function resolveIssue(
  db: Db,
  id: string,
  by: { byName: string; bySide: "marketer" | "admin"; text: string },
): Promise<PayIssue> {
  const now = Date.now();
  const after = await issues(db).findOneAndUpdate(
    { _id: id },
    {
      $push: { messages: { at: now, byName: by.byName, bySide: by.bySide, text: by.text, proof: [] } },
      $set: { status: "resolved", resolvedAt: now, updatedAt: now },
    },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError(`payment problem ${id}`);
  return toPayIssue(after);
}

/* ══════════════════════════════════════════════════════════════════ ALERTS ══ */

/** How long an approval or a refusal stays on the marketer's list. */
const DECISION_SHOWN_MS = 14 * DAY_MS;

const TONE_RANK: Record<MarketerAlertTone, number> = { act: 0, "heads-up": 1, good: 2 };

export interface AlertContext {
  /** Whether this site can check a bank account at all. An unchecked account is only news when it can. */
  bankCheck: boolean;
  now?: number;
}

/** `25th`, for a sentence about the cutoff day. */
function ordinal(day: number): string {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`;
  return `${day}${["th", "st", "nd", "rd"][day % 10] ?? "th"}`;
}

/**
 * The last day of the month whose pay run takes money approved at `earnedAt`.
 *
 * The rule `buildPayRun` gathers by: approved on or before the cutoff day joins
 * that month's run, approved after it waits for the next one. Money left over
 * from a month already gone joins this month's. Local to the server, like
 * `payMonth` and `cutoffFor`.
 */
function payDayFor(earnedAt: number, now: number, cutoffDay: number): Date {
  const earned = new Date(earnedAt);
  const today = new Date(now);
  const earnedMonth =
    earned.getFullYear() * 12 + earned.getMonth() + (earned.getDate() > cutoffDay ? 1 : 0);
  const month = Math.max(earnedMonth, today.getFullYear() * 12 + today.getMonth());
  // Day 0 of the month after is the last day of this one.
  return new Date(Math.floor(month / 12), (month % 12) + 1, 0);
}

/**
 * Everything the app should ask this marketer to handle, act first, then
 * heads-up, then good news, newest first within each.
 *
 * Every alert names one action and the screen that completes it. Nothing here
 * is stored: each read works the list out from the deals, the pay runs, the
 * problems and the ledger as they stand, so doing the thing is what clears it.
 */
export async function alertsFor(
  db: Db,
  marketer: Marketer,
  settings: MarketingSettings,
  context: AlertContext,
): Promise<MarketerAlert[]> {
  const now = context.now ?? Date.now();
  const windowMs = settings.issueWindowDays * DAY_MS;

  const [sentBack, decided, openIssues, paidRuns, waiting, levelOne, statusRow] = await Promise.all([
    deals(db)
      .find({ reporterId: marketer.id, status: "info" })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .toArray(),
    deals(db)
      .find({
        status: { $in: ["approved", "rejected"] },
        reviewedAt: { $gte: now - DECISION_SHOWN_MS },
        $or: [{ reporterId: marketer.id }, { "shares.marketerId": marketer.id }],
      })
      .sort({ reviewedAt: -1, _id: -1 })
      .limit(20)
      .toArray(),
    issues(db)
      .find({ marketerId: marketer.id, status: "open" })
      .sort({ createdAt: -1, _id: -1 })
      .limit(20)
      .toArray(),
    payRuns(db)
      .find({
        items: {
          $elemMatch: { marketerId: marketer.id, status: "paid", paidAt: { $gte: now - windowMs } },
        },
      })
      .sort({ month: -1 })
      .limit(6)
      .toArray(),
    ledger(db)
      .aggregate<{ _id: null; total: number; first: number; last: number }>([
        { $match: { marketerId: marketer.id, status: "earned" } },
        {
          $group: {
            _id: null,
            total: { $sum: "$amountMinor" },
            first: { $min: "$createdAt" },
            last: { $max: "$createdAt" },
          },
        },
      ])
      .toArray(),
    marketers(db).countDocuments({ parentId: marketer.id }),
    // `statusAt` is not on the wire shape, and only a paused account needs it.
    marketer.status === "paused"
      ? marketers(db).findOne({ _id: marketer.id }, { projection: { statusAt: 1 } })
      : Promise.resolve(null),
  ]);

  // `body` is ours and short enough to sit whole on a home card. Anything an
  // admin typed, which can run to paragraphs, goes in `detail` for the full list.
  const out: MarketerAlert[] = [];

  if (!marketer.bank) {
    out.push({
      id: "bank-missing",
      tone: "act",
      icon: "bank",
      title: "Add your bank account",
      body: "We cannot pay you until you do.",
      detail: "",
      action: { label: "Add bank account", href: "/m/profile#bank" },
      at: marketer.joinedAt,
    });
  } else if (marketer.bank.verifiedAt === null && context.bankCheck) {
    out.push({
      id: "bank-unchecked",
      tone: "heads-up",
      icon: "bank",
      title: "Check your bank account",
      body: `Save the account ending ${marketer.bank.accountNumber.slice(-4)} again so we can check it.`,
      detail: "",
      action: { label: "Check bank account", href: "/m/profile#bank" },
      at: marketer.updatedAt,
    });
  }

  if (marketer.status === "paused") {
    const phone = settings.supportPhone.replace(/\s/gu, "");
    out.push({
      id: "paused",
      tone: "act",
      icon: "shield",
      title: "Your account is paused",
      body: "Talk to AV Homes to turn it back on.",
      detail: marketer.statusReason.trim(),
      // Only AV Homes can turn it back on, so the task is reaching them.
      action: phone
        ? { label: "Call AV Homes", href: `tel:${phone}` }
        : { label: "Get help", href: "/m/help" },
      at: statusRow?.statusAt ?? marketer.updatedAt,
    });
  }

  for (const doc of sentBack) {
    out.push({
      id: `deal-info:${doc._id}`,
      tone: "act",
      icon: "photo",
      title: `${doc.listingTitle} needs more info`,
      body: "Send the proof AV Homes asked for.",
      detail: (doc.reason ?? "").trim(),
      action: { label: "Send more proof", href: `/m/deals/${doc._id}` },
      at: doc.reviewedAt ?? doc.updatedAt,
    });
  }

  for (const doc of openIssues) {
    const last = (doc.messages ?? []).at(-1);
    // Their own message last means the ball is with AV Homes, not with them.
    if (!last || last.bySide !== "admin") continue;
    out.push({
      id: `issue-reply:${doc._id}`,
      tone: "act",
      icon: "money",
      title: `AV Homes replied about ${payMonthLabel(doc.month)}`,
      body: "Read what they said about your pay.",
      detail: last.text.trim(),
      // The thread sits under the payment's figure, a screen or two down.
      action: { label: "Read the reply", href: `/m/money/${doc.payRunId}#thread` },
      at: last.at,
    });
  }

  const openIssueIds = new Set(openIssues.map((doc) => doc._id));
  for (const run of paidRuns) {
    const item = run.items.find((row) => row.marketerId === marketer.id);
    if (!item || item.status !== "paid" || item.paidAt === null) continue;
    // An open problem already says it did not arrive. Asking them to check is noise.
    if (item.issueId && openIssueIds.has(item.issueId)) continue;
    const where = item.bank
      ? `the account ending ${item.bank.accountNumber.slice(-4)}`
      : "your bank account";
    out.push({
      id: `payment-sent:${run._id}`,
      tone: "good",
      icon: "money",
      title: `${formatMoney(item.totalMinor, run.currency)} was sent to you`,
      body: `Your ${payMonthLabel(run.month)} pay went to ${where}.`,
      detail: "",
      action: { label: "See the payment", href: `/m/money/${run._id}` },
      at: item.paidAt,
    });
  }

  for (const doc of decided) {
    const at = doc.reviewedAt ?? doc.updatedAt;
    if (doc.status === "approved") {
      const share = (doc.shares ?? []).find((row) => row.marketerId === marketer.id);
      // Approved without a share for them is not news about their money.
      if (!share) continue;
      const first = doc.reporterName.trim().split(/\s+/u)[0] || doc.reporterName;
      out.push({
        id: `deal-approved:${doc._id}`,
        tone: "good",
        icon: "check",
        title: `You earned ${formatMoney(share.amountMinor, doc.currency)}`,
        body:
          doc.reporterId === marketer.id
            ? `${doc.listingTitle} was approved.`
            : `Your level ${share.level} share of ${first}'s deal.`,
        detail: "",
        action: { label: "See the deal", href: `/m/deals/${doc._id}` },
        at,
      });
    } else if (doc.reporterId === marketer.id) {
      out.push({
        id: `deal-refused:${doc._id}`,
        tone: "heads-up",
        icon: "deals",
        title: `${doc.listingTitle} was not approved`,
        body: "Read why, so your next report goes through.",
        detail: (doc.reason ?? "").trim(),
        action: { label: "See why", href: `/m/deals/${doc._id}` },
        at,
      });
    }
  }

  if (levelOne === 0) {
    out.push({
      id: "no-team",
      tone: "heads-up",
      icon: "team",
      title: "Invite your first marketer",
      body: "Earn a share of every deal they close.",
      detail: "",
      action: { label: "Invite someone", href: "/m/invite" },
      at: marketer.joinedAt,
    });
  }

  const pot = waiting[0];
  if (pot && pot.total > 0) {
    const payDay = payDayFor(pot.first, now, settings.payCutoffDay);
    out.push({
      id: "pay-day",
      tone: "heads-up",
      icon: "payday",
      title: `Pay day is ${payDay.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`,
      body: `${formatMoney(pot.total, settings.currency)} is waiting for you.`,
      detail: `Anything approved after the ${ordinal(settings.payCutoffDay)} goes out the month after.`,
      action: { label: "See your money", href: "/m/money" },
      at: pot.last,
    });
  }

  return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.at - a.at);
}

/* ═════════════════════════════════════════════════════════════════ UPDATES ══ */

export interface UpdateInput {
  title: string;
  body: string;
  imageUrl: string;
  linkLabel: string;
  linkHref: string;
  tone: MarketingUpdateTone;
  pinned: boolean;
  status: MarketingUpdateStatus;
  startsAt: number;
  endsAt: number | null;
}

/** Only these may be written, whatever the body carries. */
const UPDATE_WRITABLE = [
  "title",
  "body",
  "imageUrl",
  "linkLabel",
  "linkHref",
  "tone",
  "pinned",
  "status",
  "startsAt",
  "endsAt",
] as const;

/** Every card an admin wrote, drafts and ended ones included, newest first. */
export async function listUpdates(db: Db, limit: number): Promise<MarketingUpdate[]> {
  const docs = await updates(db).find({}).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  return docs.map(toMarketingUpdate);
}

export async function getUpdate(db: Db, id: string): Promise<UpdateDoc | null> {
  return updates(db).findOne({ _id: id });
}

/** Live cards whose window holds `now`: pinned first, then the most recently started. */
export async function liveUpdates(db: Db, now: number, limit: number): Promise<MarketingUpdate[]> {
  const docs = await updates(db)
    .find({
      status: "live",
      startsAt: { $lte: now },
      $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
    })
    .sort({ pinned: -1, startsAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toMarketingUpdate);
}

export async function createUpdate(
  db: Db,
  input: UpdateInput,
  actor: { id: string; name: string },
): Promise<MarketingUpdate> {
  const now = Date.now();
  const doc: UpdateDoc = {
    _id: newId("upd", now),
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl,
    linkLabel: input.linkLabel,
    linkHref: input.linkHref,
    tone: input.tone,
    pinned: input.pinned,
    status: input.status,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    createdBy: actor.id,
    createdByName: actor.name,
    createdAt: now,
    updatedAt: now,
  };
  await updates(db).insertOne(doc);
  return toMarketingUpdate(doc);
}

export async function saveUpdate(
  db: Db,
  id: string,
  patch: Partial<UpdateInput>,
): Promise<MarketingUpdate> {
  const set: Record<string, unknown> = { updatedAt: Date.now() };
  for (const key of UPDATE_WRITABLE) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }
  const after = await updates(db).findOneAndUpdate(
    { _id: id },
    { $set: set },
    { returnDocument: "after" },
  );
  if (!after) throw new NotFoundError(`update ${id}`);
  return toMarketingUpdate(after);
}

/** Gone for good. A card is a notice, not a record anybody is owed. */
export async function deleteUpdate(db: Db, id: string): Promise<boolean> {
  const result = await updates(db).deleteOne({ _id: id });
  return result.deletedCount === 1;
}

/* ══════════════════════════════════════════════════════════════════ COUNTS ══ */

export interface MarketingCounts {
  dealsWaiting: number;
  issuesOpen: number;
  marketersActive: number;
  /** Money approved and not yet in a pay run. */
  owedMinor: number;
  /** The month a run has not been made for yet, or empty. */
  monthDue: string;
}

export async function marketingCounts(db: Db): Promise<MarketingCounts> {
  const month = payMonth(Date.now());
  const [dealsWaiting, issuesOpen, marketersActive, owed, run] = await Promise.all([
    deals(db).countDocuments({ status: "pending" }),
    issues(db).countDocuments({ status: "open" }),
    marketers(db).countDocuments({ status: "active" }),
    ledger(db)
      .aggregate<{ _id: null; total: number }>([
        { $match: { status: "earned" } },
        { $group: { _id: null, total: { $sum: "$amountMinor" } } },
      ])
      .toArray(),
    payRuns(db).findOne({ month }),
  ]);
  const owedMinor = owed[0]?.total ?? 0;
  return {
    dealsWaiting,
    issuesOpen,
    marketersActive,
    owedMinor,
    monthDue: !run && owedMinor > 0 ? month : "",
  };
}

/**
 * Does the ledger still add up?
 *
 * Every line a marketer has, by status, against what the pay runs say was paid
 * to them. A mismatch means something wrote money outside this file, which is
 * the one failure this feature must never hide.
 */
export async function reconcile(db: Db): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  const paidByLedger = await ledger(db)
    .aggregate<{ _id: string; total: number }>([
      { $match: { status: "paid" } },
      { $group: { _id: "$marketerId", total: { $sum: "$amountMinor" } } },
    ])
    .toArray();
  const byMarketer = new Map(paidByLedger.map((row) => [row._id, row.total]));

  const runs = await payRuns(db).find({}).toArray();
  const paidByRun = new Map<string, number>();
  for (const run of runs) {
    for (const item of run.items) {
      if (item.status !== "paid") continue;
      paidByRun.set(item.marketerId, (paidByRun.get(item.marketerId) ?? 0) + item.totalMinor);
    }
  }

  for (const [marketerId, total] of paidByRun) {
    const fromLedger = byMarketer.get(marketerId) ?? 0;
    if (fromLedger !== total) {
      problems.push(
        `${marketerId}: pay runs say ${total} was paid, the ledger says ${fromLedger}.`,
      );
    }
  }
  return { ok: problems.length === 0, problems };
}

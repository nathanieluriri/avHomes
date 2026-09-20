/**
 * The two funds' data access. Every rule about money that belongs to nobody
 * lives here.
 *
 * Three invariants hold this file up, and all three are enforced here rather
 * than in a screen:
 *
 *  - **An entry is written once.** A payout and a reversal are new negative
 *    rows, never an edit, so a fund's history still reads as what happened.
 *  - **A balance is always a sum.** Nothing stores one. A lost write can make a
 *    fund poorer than it should be, which is visible and fixable; it can never
 *    make one richer than its own history, which is not.
 *  - **An accrual is idempotent on its deal.** Its `_id` is derived from the
 *    deal and the fund, so the retry after a crash between the marketer ledger
 *    write and this one hits a duplicate key instead of counting a sale twice.
 */

import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import { NotFoundError, PreconditionFailedError, newId } from "@avhomes/core";
import {
  DEFAULT_CURRENCY,
  FUND_KINDS,
  disbursementRefusal,
  emptyFundBalance,
  quarterFinished,
  type FundBalance,
  type FundEntry,
  type FundKind,
  type FundShare,
  type RewardAward,
  type RewardStanding,
} from "@avhomes/contracts";

interface FundDoc {
  _id: string;
  fund: FundKind;
  kind: "accrual" | "payout" | "adjustment";
  amountMinor: number;
  currency: string;
  dealId: string | null;
  rate: number;
  awardId: string | null;
  note: string;
  proof: string[];
  byName: string;
  createdAt: number;
  updatedAt: number;
}

interface AwardDoc {
  _id: string;
  quarter: string;
  status: "proposed" | "awarded" | "skipped";
  potMinor: number;
  currency: string;
  standings: RewardStanding[];
  winnerKind: "marketer" | "staff" | null;
  winnerId: string | null;
  winnerName: string | null;
  ledgerLineId: string | null;
  reference: string;
  proof: string[];
  reason: string;
  decidedByName: string;
  decidedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

function entries(db: Db) {
  return collection<FundDoc>(db, COLLECTIONS.fundLedger);
}

function awards(db: Db) {
  return collection<AwardDoc>(db, COLLECTIONS.rewardAwards);
}

function toEntry(doc: FundDoc): FundEntry {
  return {
    id: doc._id,
    fund: doc.fund,
    kind: doc.kind,
    amountMinor: doc.amountMinor,
    currency: doc.currency,
    dealId: doc.dealId ?? null,
    rate: doc.rate ?? 0,
    awardId: doc.awardId ?? null,
    note: doc.note ?? "",
    proof: doc.proof ?? [],
    byName: doc.byName ?? "",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
  };
}

function toAward(doc: AwardDoc): RewardAward {
  return {
    id: doc._id,
    quarter: doc.quarter,
    status: doc.status,
    potMinor: doc.potMinor,
    currency: doc.currency,
    standings: doc.standings ?? [],
    winnerKind: doc.winnerKind ?? null,
    winnerId: doc.winnerId ?? null,
    winnerName: doc.winnerName ?? null,
    ledgerLineId: doc.ledgerLineId ?? null,
    reference: doc.reference ?? "",
    proof: doc.proof ?? [],
    reason: doc.reason ?? "",
    decidedByName: doc.decidedByName ?? "",
    decidedAt: doc.decidedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt ?? doc.createdAt,
  };
}

/**
 * The id of one deal's accrual into one fund.
 *
 * Derived rather than minted, and that is the whole idempotence story. Both
 * halves are already `[A-Za-z0-9_-]`, so the joined string carries no dot or
 * dollar and stays a key every query in this file can address.
 */
function accrualId(dealId: string, fund: FundKind): string {
  return `facc_${fund}_${dealId}`;
}

/* ════════════════════════════════════════════════════════════════ BALANCES ══ */

/**
 * Both funds' standing in one aggregation.
 *
 * One pass grouped by fund rather than a query each, because the wallets screen
 * draws them side by side and two round trips to Atlas for two sums on one
 * collection is a round trip too many.
 */
export async function fundBalances(
  db: Db,
  names: Record<FundKind, string>,
): Promise<FundBalance[]> {
  const rows = await entries(db)
    .aggregate<{
      _id: FundKind;
      accrued: number;
      paid: number;
      entries: number;
      lastAt: number;
      currency: string;
    }>([
      {
        $group: {
          _id: "$fund",
          /* Split by SIGN, not by `kind`, so an `adjustment` lands on whichever
             side it actually moved the fund. Grouping by kind would leave a
             correction uncounted in both. */
          accrued: { $sum: { $cond: [{ $gt: ["$amountMinor", 0] }, "$amountMinor", 0] } },
          paid: { $sum: { $cond: [{ $lt: ["$amountMinor", 0] }, "$amountMinor", 0] } },
          entries: { $sum: 1 },
          lastAt: { $max: "$createdAt" },
          currency: { $last: "$currency" },
        },
      },
    ])
    .toArray();

  const byFund = new Map(rows.map((row) => [row._id, row]));
  return FUND_KINDS.map((fund) => {
    const row = byFund.get(fund);
    const name = names[fund];
    if (!row) return emptyFundBalance(fund, name);
    const accrued = row.accrued;
    // Stored negative, reported positive: "paid out" is a quantity, not a delta.
    const paid = Math.abs(row.paid);
    return {
      fund,
      name,
      currency: row.currency || DEFAULT_CURRENCY,
      accruedMinor: accrued,
      paidMinor: paid,
      balanceMinor: accrued - paid,
      entries: row.entries,
      lastAt: row.lastAt ?? null,
    };
  });
}

export async function fundBalance(
  db: Db,
  fund: FundKind,
  names: Record<FundKind, string>,
): Promise<FundBalance> {
  const all = await fundBalances(db, names);
  return all.find((balance) => balance.fund === fund) ?? emptyFundBalance(fund, names[fund]);
}

/** One fund's statement, newest first. Keyset, like every other list here. */
export async function listFundEntries(
  db: Db,
  input: { fund: FundKind; limit: number; before?: number | undefined },
): Promise<{ entries: FundEntry[]; nextBefore: number | null }> {
  const filter: Record<string, unknown> = { fund: input.fund };
  if (input.before !== undefined) filter.createdAt = { $lt: input.before };
  const rows = await entries(db)
    .find(filter, { sort: { createdAt: -1, _id: -1 }, limit: input.limit + 1 })
    .toArray();
  const page = rows.slice(0, input.limit);
  const last = page[page.length - 1];
  return {
    entries: page.map(toEntry),
    nextBefore: rows.length > input.limit && last ? last.createdAt : null,
  };
}

/* ═════════════════════════════════════════════════════════════════ ACCRUAL ══ */

/**
 * What marketing hands over when a deal settles. Injected at the root.
 *
 * Takes `db` first, so `accrueForDeal` itself satisfies it and the composition
 * root passes the function rather than a wrapper. A port type that does not match
 * its own implementation is a trap for whoever wires the next one.
 */
export interface FundAccrualPort {
  (
    db: Db,
    input: {
      dealId: string;
      currency: string;
      shares: readonly FundShare[];
      byName: string;
    },
  ): Promise<void>;
}

/**
 * Both of one deal's fund shares, written once however many times this is called.
 *
 * `ordered: false` with a swallowed duplicate key is the whole mechanism: the
 * ids are derived, so a second call inserts nothing and reports success, and a
 * call where one of the two already exists still writes the other. This is the
 * only place in this package where an 11000 is not an error.
 */
export async function accrueForDeal(
  db: Db,
  input: {
    dealId: string;
    currency: string;
    shares: readonly FundShare[];
    byName: string;
  },
): Promise<void> {
  if (input.shares.length === 0) return;
  const now = Date.now();
  const docs: FundDoc[] = input.shares
    .filter((share) => share.amountMinor > 0)
    .map((share) => ({
      _id: accrualId(input.dealId, share.fund),
      fund: share.fund,
      kind: "accrual" as const,
      amountMinor: share.amountMinor,
      currency: input.currency,
      dealId: input.dealId,
      rate: share.rate,
      awardId: null,
      note: "",
      proof: [],
      byName: input.byName,
      createdAt: now,
      updatedAt: now,
    }));
  if (docs.length === 0) return;

  try {
    await entries(db).insertMany(docs, { ordered: false });
  } catch (err) {
    const code = (err as { code?: number }).code;
    const writeErrors = (err as { writeErrors?: { code?: number }[] }).writeErrors ?? [];
    const onlyDuplicates =
      code === 11000 && writeErrors.every((entry) => entry.code === undefined || entry.code === 11000);
    if (!onlyDuplicates && code !== 11000) throw err;
  }
}

/**
 * The deal fell through: take both shares back out.
 *
 * Negative entries pointing at the same deal, never a delete, so the fund's
 * history shows the sale and its undoing rather than neither. Already-reversed
 * accruals are skipped by comparing what the deal has netted to zero, so calling
 * this twice cannot drain a fund.
 */
export async function reverseForDeal(
  db: Db,
  input: { dealId: string; byName: string; note: string },
): Promise<number> {
  const rows = await entries(db).find({ dealId: input.dealId }).toArray();
  if (rows.length === 0) return 0;

  // Net per fund, so a deal already reversed nets to zero and writes nothing.
  const net = new Map<FundKind, { amount: number; currency: string; rate: number }>();
  for (const row of rows) {
    const found = net.get(row.fund);
    net.set(row.fund, {
      amount: (found?.amount ?? 0) + row.amountMinor,
      currency: row.currency,
      rate: found?.rate ?? row.rate,
    });
  }

  const now = Date.now();
  const docs: FundDoc[] = [];
  for (const [fund, entry] of net) {
    if (entry.amount <= 0) continue;
    docs.push({
      _id: newId("fund", now + docs.length),
      fund,
      kind: "adjustment",
      amountMinor: -entry.amount,
      currency: entry.currency,
      dealId: input.dealId,
      rate: entry.rate,
      awardId: null,
      note: input.note,
      proof: [],
      byName: input.byName,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (docs.length === 0) return 0;
  await entries(db).insertMany(docs);
  return docs.length;
}

/** The reverse port, as marketing receives it. */
export interface FundReversalPort {
  (db: Db, input: { dealId: string; byName: string; note: string }): Promise<number>;
}

/* ═════════════════════════════════════════════════════════════════ SPENDING ══ */

/**
 * Money leaving a fund, with a receipt.
 *
 * Refused past the balance rather than allowed to go negative. A fund's balance
 * is the sum of its history, so a negative one is the fund claiming it gave away
 * money it never had, which is not a thing to record: it is a thing to stop.
 */
export async function disburse(
  db: Db,
  input: {
    fund: FundKind;
    amountMinor: number;
    currency: string;
    note: string;
    proof: string[];
    byName: string;
    names: Record<FundKind, string>;
  },
): Promise<FundEntry> {
  const balance = await fundBalance(db, input.fund, input.names);
  const refusal = disbursementRefusal({
    amountMinor: input.amountMinor,
    balanceMinor: balance.balanceMinor,
    note: input.note,
    proof: input.proof,
  });
  if (refusal) {
    throw new PreconditionFailedError("fund_disbursement_refused", { detail: refusal });
  }

  const now = Date.now();
  const doc: FundDoc = {
    _id: newId("fund", now),
    fund: input.fund,
    kind: "payout",
    // Stored NEGATIVE, because the balance is a sum and a payout reduces it.
    amountMinor: -input.amountMinor,
    currency: input.currency,
    dealId: null,
    rate: 0,
    awardId: null,
    note: input.note.trim(),
    proof: input.proof,
    byName: input.byName,
    createdAt: now,
    updatedAt: now,
  };
  await entries(db).insertOne(doc);
  return toEntry(doc);
}

/* ═══════════════════════════════════════════════════════════════════ AWARDS ══ */

export async function getAward(db: Db, quarter: string): Promise<RewardAward | null> {
  const doc = await awards(db).findOne({ quarter });
  return doc ? toAward(doc) : null;
}

export async function listAwards(db: Db, limit: number): Promise<RewardAward[]> {
  const rows = await awards(db)
    .find({}, { sort: { quarter: -1 }, limit })
    .toArray();
  return rows.map(toAward);
}

/**
 * Close a quarter: snapshot the pot and the table, and propose the winner.
 *
 * Proposing writes nothing to anybody's money. It exists so the decision has a
 * record before the payment does, and so the standings are frozen at the moment
 * the quarter closed rather than recomputed later from a table that has since
 * moved.
 */
export async function proposeAward(
  db: Db,
  input: {
    quarter: string;
    potMinor: number;
    currency: string;
    standings: RewardStanding[];
  },
): Promise<RewardAward> {
  if (!quarterFinished(input.quarter)) {
    throw new PreconditionFailedError("quarter_not_finished", {
      detail: "That quarter is not over yet.",
    });
  }
  const existing = await awards(db).findOne({ quarter: input.quarter });
  if (existing && existing.status !== "proposed") {
    throw new PreconditionFailedError("award_settled", {
      detail: "That quarter has already been decided.",
    });
  }

  const now = Date.now();
  const doc: AwardDoc = {
    _id: existing?._id ?? newId("awrd", now),
    quarter: input.quarter,
    status: "proposed",
    potMinor: input.potMinor,
    currency: input.currency,
    standings: input.standings,
    winnerKind: null,
    winnerId: null,
    winnerName: null,
    ledgerLineId: null,
    reference: "",
    proof: [],
    reason: "",
    decidedByName: "",
    decidedAt: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  /* Upsert on the quarter rather than insert, so re-closing a quarter whose
     award is still only proposed refreshes the snapshot instead of failing on the
     unique index. Once it is awarded the check above refuses. */
  await awards(db).updateOne({ quarter: input.quarter }, { $set: doc }, { upsert: true });
  return toAward(doc);
}

/**
 * Confirm the winner, or decide not to award the quarter at all.
 *
 * A marketer winner is credited through `payMarketer`, the callback the
 * composition root passes in, which is how this package pays a marketer without
 * importing marketing. A staff winner has no ledger to credit, so the transfer
 * reference and its proof are the record, and the plan says why that is enough
 * for a quarterly prize.
 *
 * The fund is debited LAST. A crash before it leaves a credited winner and a
 * fund that still shows the money, which reads as an obvious unfinished payout;
 * the other order would leave the fund short with nobody credited, which reads
 * as money that vanished.
 */
export async function settleAward(
  db: Db,
  input: {
    quarter: string;
    winner: { kind: "marketer" | "staff"; id: string; name: string } | null;
    reference: string;
    proof: string[];
    reason: string;
    byName: string;
    payMarketer: (winnerId: string, amountMinor: number, note: string) => Promise<string>;
  },
): Promise<RewardAward> {
  const doc = await awards(db).findOne({ quarter: input.quarter });
  if (!doc) throw new NotFoundError(`award ${input.quarter}`);
  if (doc.status !== "proposed") {
    throw new PreconditionFailedError("award_settled", {
      detail: "That quarter has already been decided.",
    });
  }

  const now = Date.now();

  // Not awarding is a decision with a record, not an absence of one.
  if (input.winner === null) {
    const after = await awards(db).findOneAndUpdate(
      { quarter: input.quarter, status: "proposed" },
      {
        $set: {
          status: "skipped",
          reason: input.reason,
          decidedByName: input.byName,
          decidedAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    );
    if (!after) throw new PreconditionFailedError("award_settled");
    return toAward(after);
  }

  if (doc.potMinor <= 0) {
    throw new PreconditionFailedError("empty_pot", {
      detail: "There is nothing in the pool for that quarter.",
    });
  }

  let ledgerLineId: string | null = null;
  if (input.winner.kind === "marketer") {
    ledgerLineId = await input.payMarketer(
      input.winner.id,
      doc.potMinor,
      `Reward pool, ${input.quarter}`,
    );
  }

  /*
   * The CAS: only a still-proposed award is settled, so two admins confirming at
   * once cannot both pay. The loser's `payMarketer` line is already written, so
   * the refusal below is the signal to go and void it, which is why this returns
   * the failure rather than swallowing it.
   */
  const after = await awards(db).findOneAndUpdate(
    { quarter: input.quarter, status: "proposed" },
    {
      $set: {
        status: "awarded",
        winnerKind: input.winner.kind,
        winnerId: input.winner.id,
        winnerName: input.winner.name,
        ledgerLineId,
        reference: input.reference,
        proof: input.proof,
        reason: input.reason,
        decidedByName: input.byName,
        decidedAt: now,
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
  if (!after) {
    throw new PreconditionFailedError("award_settled", {
      detail: "Somebody else decided that quarter a moment ago.",
    });
  }

  await entries(db).insertOne({
    _id: newId("fund", now),
    fund: "reward",
    kind: "payout",
    amountMinor: -doc.potMinor,
    currency: doc.currency,
    dealId: null,
    rate: 0,
    awardId: after._id,
    note: `Prize for ${input.quarter}, to ${input.winner.name}`,
    proof: input.proof,
    byName: input.byName,
    createdAt: now,
    updatedAt: now,
  });

  return toAward(after);
}

/* ══════════════════════════════════════════════════════════════ RECONCILE ══ */

/**
 * Does the fund ledger agree with the deals behind it?
 *
 * The check that catches a crash between a deal's ledger lines and its accruals,
 * which is the one window `recordSale` leaves open by not using a transaction.
 * It is read only and names the deal, so the fix is a human decision.
 */
export async function reconcileFunds(
  db: Db,
  approvedDealIds: readonly string[],
): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  const approved = new Set(approvedDealIds);

  const rows = await entries(db)
    .aggregate<{ _id: string | null; net: number }>([
      { $match: { dealId: { $ne: null } } },
      { $group: { _id: "$dealId", net: { $sum: "$amountMinor" } } },
    ])
    .toArray();

  for (const row of rows) {
    if (row._id === null) continue;
    /* A net of zero is a reversed deal, which is correct whether or not the deal
       is still approved: it means the fund gave the money back. */
    if (row.net === 0) continue;
    if (!approved.has(row._id)) {
      problems.push(`fund_ledger holds ${row.net} for deal ${row._id}, which is not approved`);
    }
  }

  const accrued = new Set(rows.filter((row) => row.net !== 0).map((row) => row._id));
  for (const dealId of approved) {
    if (!accrued.has(dealId)) {
      problems.push(`deal ${dealId} is approved but has no fund accrual`);
    }
  }

  return { ok: problems.length === 0, problems };
}

// TODO(test): accrueForDeal called twice writes one pair of entries.
// TODO(test): reverseForDeal called twice leaves the fund at the same balance.
// TODO(test): disburse past the balance is refused and writes nothing.
// TODO(test): settleAward on an already-awarded quarter refuses without paying.
// TODO(test): fundBalances counts a negative adjustment as paid, not accrued.

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
  fundMonthOf,
  voidRefusal,
  emptyFundBalance,
  quarterFinished,
  type FundBalance,
  type FundEntry,
  type FundKind,
  type FundMonth,
  type FundMonthly,
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
  paidAt?: number | null;
  recipient?: string;
  reference?: string;
  voidedAt?: number | null;
  voidReason?: string;
  voidedByName?: string;
  voidsId?: string | null;
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
    paidAt: doc.paidAt ?? (doc.kind === "payout" ? doc.createdAt : null),
    recipient: doc.recipient ?? "",
    reference: doc.reference ?? "",
    voidedAt: doc.voidedAt ?? null,
    voidReason: doc.voidReason ?? "",
    voidedByName: doc.voidedByName ?? "",
    voidsId: doc.voidsId ?? null,
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
 *
 * `round` counts the times this deal's share was already handed back. A deal
 * that is cancelled and then approved again needs a second accrual, and the bare
 * id would hit the first one's duplicate key and credit the fund nothing. The
 * round is read from the ledger, so a retry of the same approval still lands on
 * the same id.
 */
function accrualId(dealId: string, fund: FundKind, round = 0): string {
  return round === 0 ? `facc_${fund}_${dealId}` : `facc_${fund}_${dealId}_${round}`;
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
          /* Split by WHERE THE MONEY CAME FROM, not by sign. A cancelled deal's
             reversal is negative but it is not a payment, and a voided payment's
             give-back is positive but it is not income. Splitting by sign called
             the first "paid out" and the second "from sales". Every deal row is
             income, net; every other row is spending, net. */
          accrued: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$dealId", null] }, null] }, "$amountMinor", 0] } },
          paid: { $sum: { $cond: [{ $eq: [{ $ifNull: ["$dealId", null] }, null] }, "$amountMinor", 0] } },
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
  const reversals = await entries(db)
    .find({ dealId: input.dealId, kind: "adjustment", amountMinor: { $lt: 0 } }, { projection: { fund: 1 } })
    .toArray();
  const round = (fund: FundKind) => reversals.filter((row) => row.fund === fund).length;
  const docs: FundDoc[] = input.shares
    .filter((share) => share.amountMinor > 0)
    .map((share) => ({
      _id: accrualId(input.dealId, share.fund, round(share.fund)),
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
    // Any other write error in the batch is real, even when the first one was a duplicate.
    const onlyDuplicates =
      code === 11000 && writeErrors.every((entry) => entry.code === undefined || entry.code === 11000);
    if (!onlyDuplicates) throw err;
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
 * Money leaving a fund, recorded with who got it, when and why.
 *
 * Refused past the balance rather than allowed to go negative. A fund's balance
 * is the sum of its history, so a negative one is the fund claiming it gave away
 * money it never had, which is not a thing to record: it is a thing to stop.
 *
 * The check and the write are two steps, so two payments recorded at the same
 * moment could each pass against the same balance. The balance is read again
 * after the write, and a payment that took the fund below zero takes itself back
 * out. Both racers may lose that way, which is a retry; neither can overdraw.
 */
export async function disburse(
  db: Db,
  input: {
    fund: FundKind;
    amountMinor: number;
    currency: string;
    recipient: string;
    note: string;
    reference: string;
    paidAt: number;
    proof: string[];
    byName: string;
    names: Record<FundKind, string>;
  },
): Promise<FundEntry> {
  const balance = await fundBalance(db, input.fund, input.names);
  const refusal = disbursementRefusal({
    amountMinor: input.amountMinor,
    balanceMinor: balance.balanceMinor,
    recipient: input.recipient,
    note: input.note,
    paidAt: input.paidAt,
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
    paidAt: input.paidAt,
    recipient: input.recipient.trim(),
    reference: input.reference.trim(),
    voidedAt: null,
    voidReason: "",
    voidedByName: "",
    voidsId: null,
    createdAt: now,
    updatedAt: now,
  };
  await entries(db).insertOne(doc);

  const after = await fundBalance(db, input.fund, input.names);
  if (after.balanceMinor < 0) {
    await entries(db).deleteOne({ _id: doc._id });
    throw new PreconditionFailedError("fund_disbursement_refused", {
      detail: "Another payment was recorded at the same moment. Check the balance and try again.",
    });
  }
  return toEntry(doc);
}

/**
 * A payment recorded by mistake. Its row stays, marked void, and a new entry
 * gives the money back, so the history shows both the mistake and the fix.
 *
 * The give-back's id is derived from the payment, so a retry after a crash
 * between the two writes finishes the job instead of refunding twice.
 */
export async function voidPayment(
  db: Db,
  input: { fund: FundKind; id: string; reason: string; byName: string },
): Promise<FundEntry> {
  const doc = await entries(db).findOne({ _id: input.id, fund: input.fund });
  if (!doc) throw new NotFoundError(`payment ${input.id}`);
  const current = toEntry(doc);
  const refusal = voidRefusal(current, input.reason);
  /* Already voided is the retry case: fall through and make sure the give-back
     exists, rather than refusing a call that is finishing its own work. */
  if (refusal && current.voidedAt === null) {
    throw new PreconditionFailedError("fund_void_refused", { detail: refusal });
  }

  const now = Date.now();
  const marked =
    (await entries(db).findOneAndUpdate(
      { _id: input.id, kind: "payout", voidedAt: null },
      {
        $set: {
          voidedAt: now,
          voidReason: input.reason.trim(),
          voidedByName: input.byName,
          updatedAt: now,
        },
      },
      { returnDocument: "after" },
    )) ?? (await entries(db).findOne({ _id: input.id }));
  if (!marked) throw new NotFoundError(`payment ${input.id}`);

  try {
    await entries(db).insertOne({
      _id: `fvoid_${marked._id}`,
      fund: marked.fund,
      kind: "adjustment",
      amountMinor: Math.abs(marked.amountMinor),
      currency: marked.currency,
      dealId: null,
      rate: 0,
      awardId: null,
      note: `Voided: ${marked.voidReason || input.reason.trim()}`,
      proof: [],
      byName: input.byName,
      paidAt: null,
      recipient: "",
      reference: "",
      voidedAt: null,
      voidReason: "",
      voidedByName: "",
      voidsId: marked._id,
      createdAt: now,
      updatedAt: now,
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
  return toEntry(marked);
}

/** A fund's payments, newest paid first, voided ones included and marked. */
export async function listPayments(
  db: Db,
  input: { fund: FundKind; limit: number },
): Promise<FundEntry[]> {
  const rows = await entries(db)
    .find({ fund: input.fund, kind: "payout" }, { sort: { createdAt: -1, _id: -1 }, limit: input.limit })
    .toArray();
  return rows
    .map(toEntry)
    .sort((a, b) => (b.paidAt ?? b.createdAt) - (a.paidAt ?? a.createdAt) || b.createdAt - a.createdAt);
}

/* ═══════════════════════════════════════════════════════════════ MONTHLY ══ */

/**
 * A fund month by month: what came in and from how many deals, what went back
 * when a deal fell through, what was paid out, and where the balance closed.
 *
 * Read from the whole ledger, which grows by a few rows per deal and stays small
 * enough to fold in memory. A voided payment and its give-back are both left out,
 * since together they moved nothing, so a month is never shown paying out money
 * that was in fact never paid.
 */
export async function fundMonthly(
  db: Db,
  input: { fund: FundKind; months: number; names: Record<FundKind, string>; now?: number },
): Promise<FundMonthly> {
  const rows = await entries(db)
    .find(
      { fund: input.fund },
      { projection: { amountMinor: 1, currency: 1, dealId: 1, kind: 1, paidAt: 1, voidedAt: 1, voidsId: 1, createdAt: 1 } },
    )
    .toArray();
  return foldMonths(rows, {
    fund: input.fund,
    name: input.names[input.fund],
    months: input.months,
    now: input.now ?? Date.now(),
  });
}

type MonthRow = Pick<FundDoc, "amountMinor" | "currency" | "dealId" | "kind" | "paidAt" | "voidedAt" | "voidsId" | "createdAt">;

/** The pure half of `fundMonthly`, exported for the tests. */
export function foldMonths(
  rows: readonly MonthRow[],
  input: { fund: FundKind; name: string; months: number; now: number },
): FundMonthly {
  const count = Math.max(1, Math.min(60, Math.floor(input.months)));
  const end = new Date(input.now);
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(fundMonthOf(new Date(end.getFullYear(), end.getMonth() - i, 1).getTime()));
  }
  const first = keys[0] ?? fundMonthOf(input.now);

  const blank = (month: string): FundMonth => ({
    month,
    inMinor: 0,
    deals: 0,
    reversedMinor: 0,
    reversals: 0,
    paidMinor: 0,
    payments: 0,
    netMinor: 0,
    closingMinor: 0,
  });
  const byMonth = new Map(keys.map((key) => [key, blank(key)]));

  let opening = 0;
  let currency = DEFAULT_CURRENCY;
  for (const row of rows) {
    if (row.currency) currency = row.currency;
    if (row.voidsId || (row.kind === "payout" && row.voidedAt)) continue;
    const at = row.kind === "payout" ? (row.paidAt ?? row.createdAt) : row.createdAt;
    const month = fundMonthOf(at);
    if (month < first) {
      opening += row.amountMinor;
      continue;
    }
    const bucket = byMonth.get(month);
    // Past the current month: a payment dated ahead. Counted in the last month.
    const target = bucket ?? byMonth.get(keys[keys.length - 1] ?? month);
    if (!target) continue;
    if (row.dealId) {
      if (row.amountMinor >= 0) {
        target.inMinor += row.amountMinor;
        target.deals += 1;
      } else {
        target.reversedMinor += -row.amountMinor;
        target.reversals += 1;
      }
    } else if (row.amountMinor < 0) {
      target.paidMinor += -row.amountMinor;
      target.payments += 1;
    } else {
      // A positive row with no deal and no payment behind it: a correction in.
      target.inMinor += row.amountMinor;
    }
  }

  let running = opening;
  const months = keys.map((key) => {
    const month = byMonth.get(key) ?? blank(key);
    month.netMinor = month.inMinor - month.reversedMinor - month.paidMinor;
    running += month.netMinor;
    month.closingMinor = running;
    return month;
  });

  return { fund: input.fund, name: input.name, currency, openingMinor: opening, months };
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

// TODO(test): settleAward on an already-awarded quarter refuses without paying.

export async function getFundEntry(db: Db, fund: FundKind, id: string): Promise<FundEntry | null> {
  const doc = await entries(db).findOne({ _id: id, fund });
  return doc ? toEntry(doc) : null;
}

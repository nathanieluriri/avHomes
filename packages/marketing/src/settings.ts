/**
 * The commission rules, as one document an admin owns.
 *
 * It shares the `settings` collection under its own id rather than taking a
 * collection of its own, because it is the same shape of thing: one row, read
 * on nearly every marketing request, written from one screen. Every field is
 * coalesced on read, so a document written before a field existed still answers.
 */

import type { Db } from "mongodb";
import { COLLECTIONS, collection } from "@avhomes/db";
import {
  ACCOUNT_PROVIDERS,
  DEAL_KINDS,
  DEFAULT_COMMISSION_MATRIX,
  DEFAULT_MARKETING_SETTINGS,
  DEFAULT_RATING_WEIGHTS,
  OWNERSHIPS,
  type AccountProvider,
  type CommissionMatrix,
  type CommissionSplit,
  type MarketingSettings,
  type RatingWeights,
} from "@avhomes/contracts";

const DOC_ID = "marketing";

interface SettingsDoc extends Partial<MarketingSettings> {
  _id: string;
  /**
   * The rate pair this document held before the matrix existed.
   *
   * Kept on the stored type, and nowhere on `MarketingSettings`, because it is
   * read exactly once: to derive a matrix for a site that has not saved settings
   * since the upgrade. Nothing writes it again.
   */
  saleRates?: unknown;
  rentRates?: unknown;
  /**
   * The Paystack secret key, when an admin has pasted one in.
   *
   * Stored here rather than in the environment so it can be changed from the
   * console without a deploy, which is the point: the day the free Kora
   * endpoint closes, somebody needs to be able to fix it from a phone.
   *
   * It is NOT part of `MarketingSettings`, and that is the whole reason this
   * field is on the document type instead. `MarketingSettings` is serialised to
   * the browser on every settings read; anything on it is one screenshot from
   * being public.
   */
  paystackKey?: string;
}

function rows(db: Db) {
  return collection<SettingsDoc>(db, COLLECTIONS.settings);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** One cell, field by field, so a document missing a share still answers. */
function split(value: unknown, fallback: CommissionSplit): CommissionSplit {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<Record<keyof CommissionSplit, unknown>>;
  return {
    level1: num(raw.level1, fallback.level1),
    level2: num(raw.level2, fallback.level2),
    level3: num(raw.level3, fallback.level3),
    rewardPool: num(raw.rewardPool, fallback.rewardPool),
    foundation: num(raw.foundation, fallback.foundation),
  };
}

/**
 * The four rate cells, derived from the legacy pair when this document predates
 * the matrix.
 *
 * The stored `saleRates` and `rentRates` were AV Homes' OWN rates, because
 * partner property did not exist as a concept when they were written, so they
 * become the `av` row and `partner` takes the defaults. Both funds take the
 * default 1, which is the rule the owner set.
 *
 * Derived rather than migrated in 0015 on purpose: a settings document is one
 * row read on nearly every marketing request, and coalescing on read is the rule
 * this file already holds for every other field. A backfill would also have to
 * guess for a site that legitimately wants different partner rates, and the next
 * save from the settings screen writes the real matrix either way.
 */
function commission(doc: SettingsDoc): CommissionMatrix {
  const d = DEFAULT_COMMISSION_MATRIX;
  if (doc.commission) {
    const stored = doc.commission;
    const out = {} as CommissionMatrix;
    for (const ownership of OWNERSHIPS) {
      const row = {} as Record<(typeof DEAL_KINDS)[number], CommissionSplit>;
      for (const kind of DEAL_KINDS) {
        row[kind] = split(stored[ownership]?.[kind], d[ownership][kind]);
      }
      out[ownership] = row;
    }
    return out;
  }

  const legacy = (pair: unknown, fallback: CommissionSplit): CommissionSplit => {
    if (!Array.isArray(pair) || pair.length !== 3) return fallback;
    return {
      level1: num(pair[0], fallback.level1),
      level2: num(pair[1], fallback.level2),
      level3: num(pair[2], fallback.level3),
      rewardPool: d.av.sale.rewardPool,
      foundation: d.av.sale.foundation,
    };
  };
  return {
    av: {
      sale: legacy(doc.saleRates, d.av.sale),
      rent: legacy(doc.rentRates, d.av.rent),
    },
    partner: d.partner,
  };
}

function weights(value: unknown, fallback: RatingWeights): RatingWeights {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Partial<Record<keyof RatingWeights, unknown>>;
  return {
    value: num(raw.value, fallback.value),
    deals: num(raw.deals, fallback.deals),
    conversion: num(raw.conversion, fallback.conversion),
    speed: num(raw.speed, fallback.speed),
  };
}

export async function readMarketingSettings(db: Db): Promise<MarketingSettings> {
  const doc = await rows(db).findOne({ _id: DOC_ID });
  if (!doc) return DEFAULT_MARKETING_SETTINGS;
  const d = DEFAULT_MARKETING_SETTINGS;
  return {
    commission: commission(doc),
    rewardPoolName: doc.rewardPoolName?.trim() || d.rewardPoolName,
    foundationName: doc.foundationName?.trim() || d.foundationName,
    rating: weights(doc.rating, DEFAULT_RATING_WEIGHTS),
    rentBasis: doc.rentBasis ?? d.rentBasis,
    issueWindowDays: doc.issueWindowDays ?? d.issueWindowDays,
    payCutoffDay: doc.payCutoffDay ?? d.payCutoffDay,
    requireApproval: doc.requireApproval ?? d.requireApproval,
    joinOpen: doc.joinOpen ?? d.joinOpen,
    blockSelfDeals: doc.blockSelfDeals ?? d.blockSelfDeals,
    minPayoutMinor: doc.minPayoutMinor ?? d.minPayoutMinor,
    currency: doc.currency ?? d.currency,
    supportPhone: doc.supportPhone ?? d.supportPhone,
    accountProvider: provider(doc.accountProvider, d.accountProvider),
    updatedAt: doc.updatedAt ?? 0,
  };
}

function provider(value: unknown, fallback: AccountProvider): AccountProvider {
  return ACCOUNT_PROVIDERS.includes(value as AccountProvider) ? (value as AccountProvider) : fallback;
}

/**
 * The Paystack key, for the server only.
 *
 * Its own function rather than a field on the settings shape, so there is no
 * path by which it reaches a response: a caller has to ask for the secret by
 * name, and the only caller is the resolver.
 */
export async function readPaystackKey(db: Db): Promise<string> {
  const doc = await rows(db).findOne({ _id: DOC_ID }, { projection: { paystackKey: 1 } });
  return (doc?.paystackKey ?? "").trim();
}

/** Whether a key is saved, which is all the console needs to know about it. */
export async function paystackKeySaved(db: Db): Promise<boolean> {
  return (await readPaystackKey(db)) !== "";
}

/**
 * Save or clear the key.
 *
 * An empty string LEAVES IT ALONE rather than clearing it, because the settings
 * form posts every field on every save and the key input is necessarily blank
 * (it is never sent to the browser to prefill). Clearing is explicit.
 */
export async function writePaystackKey(db: Db, key: string | null): Promise<void> {
  if (key === null) {
    await rows(db).updateOne({ _id: DOC_ID }, { $unset: { paystackKey: "" } }, { upsert: true });
    return;
  }
  const value = key.trim();
  if (value === "") return;
  await rows(db).updateOne({ _id: DOC_ID }, { $set: { paystackKey: value } }, { upsert: true });
}

/** Only these may be written, whatever the body carries. */
const WRITABLE = [
  "commission",
  "rewardPoolName",
  "foundationName",
  "rating",
  "rentBasis",
  "issueWindowDays",
  "payCutoffDay",
  "requireApproval",
  "joinOpen",
  "blockSelfDeals",
  "minPayoutMinor",
  "supportPhone",
  "accountProvider",
] as const;

export async function writeMarketingSettings(
  db: Db,
  patch: Partial<MarketingSettings>,
): Promise<MarketingSettings> {
  const now = Date.now();
  const set: Record<string, unknown> = { updatedAt: now };
  for (const key of WRITABLE) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }
  const setOnInsert: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(DEFAULT_MARKETING_SETTINGS)) {
    if (key === "updatedAt") continue;
    if (!(key in set)) setOnInsert[key] = value;
  }
  await rows(db).updateOne({ _id: DOC_ID }, { $set: set, $setOnInsert: setOnInsert }, { upsert: true });
  return readMarketingSettings(db);
}

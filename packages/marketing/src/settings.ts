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
  DEFAULT_MARKETING_SETTINGS,
  type CommissionRates,
  type MarketingSettings,
} from "@avhomes/contracts";

const DOC_ID = "marketing";

interface SettingsDoc extends Partial<MarketingSettings> {
  _id: string;
}

function rows(db: Db) {
  return collection<SettingsDoc>(db, COLLECTIONS.settings);
}

function rates(value: unknown, fallback: CommissionRates): CommissionRates {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const out = value.map((entry) => (typeof entry === "number" && Number.isFinite(entry) ? entry : 0));
  return [out[0] ?? 0, out[1] ?? 0, out[2] ?? 0];
}

export async function readMarketingSettings(db: Db): Promise<MarketingSettings> {
  const doc = await rows(db).findOne({ _id: DOC_ID });
  if (!doc) return DEFAULT_MARKETING_SETTINGS;
  const d = DEFAULT_MARKETING_SETTINGS;
  return {
    saleRates: rates(doc.saleRates, d.saleRates),
    rentRates: rates(doc.rentRates, d.rentRates),
    rentBasis: doc.rentBasis ?? d.rentBasis,
    issueWindowDays: doc.issueWindowDays ?? d.issueWindowDays,
    payCutoffDay: doc.payCutoffDay ?? d.payCutoffDay,
    requireApproval: doc.requireApproval ?? d.requireApproval,
    joinOpen: doc.joinOpen ?? d.joinOpen,
    blockSelfDeals: doc.blockSelfDeals ?? d.blockSelfDeals,
    minPayoutMinor: doc.minPayoutMinor ?? d.minPayoutMinor,
    currency: doc.currency ?? d.currency,
    supportPhone: doc.supportPhone ?? d.supportPhone,
    updatedAt: doc.updatedAt ?? 0,
  };
}

/** Only these may be written, whatever the body carries. */
const WRITABLE = [
  "saleRates",
  "rentRates",
  "rentBasis",
  "issueWindowDays",
  "payCutoffDay",
  "requireApproval",
  "joinOpen",
  "blockSelfDeals",
  "minPayoutMinor",
  "supportPhone",
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

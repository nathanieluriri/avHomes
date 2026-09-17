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
  DEFAULT_MARKETING_SETTINGS,
  type AccountProvider,
  type CommissionRates,
  type MarketingSettings,
} from "@avhomes/contracts";

const DOC_ID = "marketing";

interface SettingsDoc extends Partial<MarketingSettings> {
  _id: string;
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

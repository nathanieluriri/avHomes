/**
 * Checking a bank account belongs to who says it does.
 *
 * One question: "what name is on this account number". It is the one check that
 * stops a payment going to a typo, and it stays optional: an account that
 * cannot be checked is still taken, marked unverified and labelled as such,
 * because refusing a signup over a provider outage is worse than a name nobody
 * read.
 *
 * TWO PROVIDERS, CHOSEN FROM THE CONSOLE.
 *
 * Kora needs no key and is the default. That is not generosity: its resolve
 * endpoint answers without credentials because of a hole in their auth, while
 * the harmless bank-list endpoint beside it correctly returns 401. An endpoint
 * that turns any ten digits into somebody's legal name is not the one a company
 * leaves open on purpose, so it can close without warning.
 *
 * Which is exactly why the choice is a settings field rather than an env var.
 * The day it closes, somebody pastes a free Paystack key into the console and
 * flips a dropdown. No deploy, no developer, no downtime on signups.
 */

import type { Db } from "mongodb";
import { UpstreamError } from "@avhomes/core";
import type { AccountProvider } from "@avhomes/contracts";
import { readMarketingSettings, readPaystackKey } from "./settings";

export interface BankOption {
  code: string;
  name: string;
}

export interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  /** Null when the check could not run, so the caller can say "unchecked". */
  verifiedAt: number | null;
}

const PAYSTACK = "https://api.paystack.co";
const KORA = "https://api.korapay.com/merchant/api/v1";
const TIMEOUT_MS = 8_000;

async function ask(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return await res.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

/* ══════════════════════════════════════════════════════════════════ BANKS ══ */

/**
 * The Nigerian bank list, from Paystack, whichever provider resolves names.
 *
 * Paystack serves this one without a key, Kora does not, and the codes are
 * interchangeable in the direction that matters: Kora accepts Paystack's
 * three-digit CBN codes. Taking the list from one place and resolving with
 * another would normally be a trap, because fintech codes are NOT portable
 * (Opay is `999992` to Paystack and `100004` on the NIP list), but the lenient
 * side is the one doing the accepting here.
 *
 * Cached for an hour in the module: it changes a few times a year, and a cold
 * signup screen should not wait on a call every other marketer already paid for.
 */
let bankCache: { at: number; banks: BankOption[] } | null = null;
const BANK_TTL_MS = 60 * 60 * 1000;

export async function listBanks(): Promise<BankOption[]> {
  if (bankCache && Date.now() - bankCache.at < BANK_TTL_MS) return bankCache.banks;

  const body = (await ask(`${PAYSTACK}/bank?currency=NGN&perPage=100`, {
    headers: { accept: "application/json" },
  })) as { status?: boolean; data?: { code: string; name: string; active?: boolean }[] } | null;

  if (!body || body.status !== true || !Array.isArray(body.data)) {
    // A missing list is not worth a 500: the join form falls back to a plain
    // bank-name field and the account is taken unverified.
    return bankCache?.banks ?? [];
  }

  const banks = body.data
    .filter((row) => row.active !== false)
    .map((row) => ({ code: row.code, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bankCache = { at: Date.now(), banks };
  return banks;
}

/* ══════════════════════════════════════════════════════════════ RESOLVING ══ */

/** What the console shows about the check without revealing the key itself. */
export interface ProviderState {
  provider: AccountProvider;
  /** False when the chosen provider cannot run: Paystack picked with no key. */
  ready: boolean;
}

export async function providerState(db: Db): Promise<ProviderState> {
  const { accountProvider } = await readMarketingSettings(db);
  if (accountProvider === "kora") return { provider: "kora", ready: true };
  return { provider: "paystack", ready: (await paystackKey(db)) !== "" };
}

/** Settings, and only settings. The console is the one place this is set. */
async function paystackKey(db: Db): Promise<string> {
  return readPaystackKey(db);
}

async function viaKora(accountNumber: string, bankCode: string): Promise<string | null> {
  const body = (await ask(`${KORA}/misc/banks/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ bank: bankCode, account: accountNumber }),
  })) as { status?: boolean; message?: string; data?: { account_name?: string } } | null;

  if (!body) throw new UpstreamError("kora", "no answer from the account check");
  // A number that does not exist is an ANSWER, not a failure: it means the
  // details are wrong, and the caller must be able to tell that apart from the
  // provider being down.
  if (body.status !== true) return null;
  const name = (body.data?.account_name ?? "").trim();
  return name === "" ? null : name;
}

async function viaPaystack(
  db: Db,
  accountNumber: string,
  bankCode: string,
): Promise<string | null> {
  const key = await paystackKey(db);
  if (key === "") throw new UpstreamError("paystack", "no Paystack key is saved");

  const body = (await ask(
    `${PAYSTACK}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: { authorization: `Bearer ${key}`, accept: "application/json" } },
  )) as { status?: boolean; message?: string; data?: { account_name?: string } } | null;

  if (!body) throw new UpstreamError("paystack", "no answer from the account check");
  if (body.status !== true) return null;
  const name = (body.data?.account_name ?? "").trim();
  return name === "" ? null : name;
}

/**
 * The name on an account.
 *
 * `null` means the account did not resolve, which is a real answer the caller
 * shows as "we could not find that account". A provider being unreachable
 * throws instead, because "your details are wrong" and "we are broken" must not
 * look the same to somebody typing their own account number.
 */
export async function resolveAccount(
  db: Db,
  accountNumber: string,
  bankCode: string,
): Promise<{ accountName: string; verifiedAt: number } | null> {
  const { accountProvider } = await readMarketingSettings(db);
  const name =
    accountProvider === "paystack"
      ? await viaPaystack(db, accountNumber, bankCode)
      : await viaKora(accountNumber, bankCode);
  return name === null ? null : { accountName: name, verifiedAt: Date.now() };
}

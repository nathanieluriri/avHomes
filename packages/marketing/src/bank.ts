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
 * THE LIST MUST COME FROM WHOEVER RESOLVES. This is not a preference.
 *
 * Nigerian bank codes are not portable, and the trap is that they LOOK
 * portable: the traditional banks use the same three-digit CBN code everywhere,
 * so GTBank is `058` to both providers and everything seems fine. The fintechs
 * are where it breaks, and the fintechs are where most marketers actually bank.
 *
 *     Opay        Paystack 999992      NIP 100004
 *     PalmPay     Paystack 999991      NIP 100033
 *     Kuda        Paystack 50211       NIP 090267
 *     Moniepoint  Paystack 50515       NIP 090405
 *
 * Kora answers `999992` with "Invalid bank provided" and `100004` with the
 * account holder's name. Verified by calling both. So a list from one provider
 * fed to the other silently fails to verify every Opay, PalmPay, Kuda and
 * Moniepoint account on the site, which is a large share of them.
 *
 * Paystack serves its list without a key. Kora's needs one (its bank list is
 * correctly authenticated, unlike its resolve endpoint), so the NIP list comes
 * from NUBAPI's public file, which is the same NIBSS numbering Kora expects.
 */
const NIP_LIST = "https://nubapi.com/bank-json";

let bankCache: { at: number; provider: AccountProvider; banks: BankOption[] } | null = null;
const BANK_TTL_MS = 60 * 60 * 1000;

export async function listBanks(db: Db): Promise<BankOption[]> {
  const { accountProvider } = await readMarketingSettings(db);
  if (bankCache && bankCache.provider === accountProvider && Date.now() - bankCache.at < BANK_TTL_MS) {
    return bankCache.banks;
  }

  const banks =
    accountProvider === "paystack" ? await paystackBanks() : await nipBanks();

  // A missing list is not worth a 500: the join form falls back to a plain bank
  // name field and the account is taken unverified.
  if (banks.length === 0) return bankCache?.banks ?? [];

  bankCache = { at: Date.now(), provider: accountProvider, banks };
  return banks;
}

function tidy(rows: { code?: unknown; name?: unknown; active?: unknown }[]): BankOption[] {
  const seen = new Set<string>();
  const out: BankOption[] = [];
  for (const row of rows) {
    if (row.active === false) continue;
    const code = String(row.code ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (code === "" || name === "") continue;
    /* Both lists carry rows that repeat a code: Paystack has five, the NIP list
       eleven. Some are one bank spelled two ways, some are genuinely two banks
       sharing a code upstream. Either way the pair resolves identically, so the
       key is code AND name and the reader can find whichever name they know. */
    const key = `${code}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function paystackBanks(): Promise<BankOption[]> {
  const body = (await ask(`${PAYSTACK}/bank?currency=NGN&perPage=100`, {
    headers: { accept: "application/json" },
  })) as { status?: boolean; data?: { code: string; name: string; active?: boolean }[] } | null;
  if (!body || body.status !== true || !Array.isArray(body.data)) return [];
  return tidy(body.data);
}

async function nipBanks(): Promise<BankOption[]> {
  const body = (await ask(NIP_LIST, { headers: { accept: "application/json" } })) as
    | { code: string; name: string; active?: boolean }[]
    | { data?: { code: string; name: string; active?: boolean }[] }
    | null;
  const rows = Array.isArray(body) ? body : (body?.data ?? []);
  if (!Array.isArray(rows)) return [];
  return tidy(rows);
}

/**
 * A code stored before the list moved, translated for Kora.
 *
 * Only the fintechs need it: their Paystack codes are proprietary and Kora
 * refuses them outright. Everything else is a CBN code both sides already
 * agree on, so it passes through untouched. Without this, every marketer who
 * signed up banking with Opay or Kuda would fail to verify forever, with no
 * sign of why.
 */
const NIP_FOR_PAYSTACK: Record<string, string> = {
  "999992": "100004", // Opay
  "999991": "100033", // PalmPay
  "50211": "090267", // Kuda
  "50515": "090405", // Moniepoint
  "50126": "090325", // Sparkle
  "50823": "090328", // Carbon
  "100004": "100004", // already NIP, left so the map reads as the whole story
};

function forKora(bankCode: string): string {
  return NIP_FOR_PAYSTACK[bankCode] ?? bankCode;
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
      : await viaKora(accountNumber, forKora(bankCode));
  return name === null ? null : { accountName: name, verifiedAt: Date.now() };
}

/**
 * Checking a bank account belongs to who says it does.
 *
 * Paystack answers "what name is on this account number", which is the one
 * check that stops a payment going to a typo. It is optional: with no key the
 * app still takes the account, marks it unverified and says so on the screen,
 * because refusing to let marketers sign up over a missing API key would be
 * worse than a name nobody checked.
 */

import { getEnv, UpstreamError } from "@avhomes/core";

export interface BankOption {
  code: string;
  name: string;
}

export interface ResolvedAccount {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
  /** Null when Paystack is not configured, so the caller can say "unchecked". */
  verifiedAt: number | null;
}

const PAYSTACK = "https://api.paystack.co";
const TIMEOUT_MS = 8_000;

export function paystackConfigured(): boolean {
  return getEnv().PAYSTACK_SECRET_KEY.trim() !== "";
}

async function paystack<T>(path: string): Promise<T> {
  const key = getEnv().PAYSTACK_SECRET_KEY.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${PAYSTACK}${path}`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string; data?: T } | null;
    if (!res.ok || !body || body.status !== true || body.data === undefined) {
      throw new UpstreamError("paystack", body?.message ?? `paystack answered ${res.status}`);
    }
    return body.data;
  } catch (err) {
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError("paystack", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The Nigerian bank list.
 *
 * Cached for an hour in the module: it changes a few times a year, and a cold
 * sign up screen should not wait on a network call that every other marketer
 * already paid for.
 */
let bankCache: { at: number; banks: BankOption[] } | null = null;
const BANK_TTL_MS = 60 * 60 * 1000;

export async function listBanks(): Promise<BankOption[]> {
  if (!paystackConfigured()) return [];
  if (bankCache && Date.now() - bankCache.at < BANK_TTL_MS) return bankCache.banks;
  const data = await paystack<{ code: string; name: string; active?: boolean }[]>(
    "/bank?country=nigeria&perPage=100",
  );
  const banks = data
    .filter((row) => row.active !== false)
    .map((row) => ({ code: row.code, name: row.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  bankCache = { at: Date.now(), banks };
  return banks;
}

/** The name on an account, or null when the check cannot run. */
export async function resolveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<{ accountName: string; verifiedAt: number } | null> {
  if (!paystackConfigured()) return null;
  const data = await paystack<{ account_name?: string }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
  const name = (data.account_name ?? "").trim();
  if (name === "") return null;
  return { accountName: name, verifiedAt: Date.now() };
}

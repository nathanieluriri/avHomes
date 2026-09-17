"use client";

import { BadgeCheck } from "lucide-react";
import { isNuban } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import type { BanksResponse, ResolvedAccount } from "@/lib/marketer/api";
import { Combobox } from "./Combobox";
import { Field, Note, Spin, inputCls } from "./ui";

/**
 * Where the money goes, and the name check that stops a typo becoming a
 * transfer to a stranger.
 *
 * The name is NEVER what the marketer types. It comes back from the bank, and it
 * is shown on its own green plate so a wrong digit is caught while somebody is
 * looking at the screen rather than at the end of the month.
 *
 * Shared by join and profile, so the two cannot disagree about what a valid
 * account looks like.
 */

export interface BankDraft {
  bankCode: string;
  bankName: string;
  accountNumber: string;
}

export const EMPTY_BANK: BankDraft = { bankCode: "", bankName: "", accountNumber: "" };

/** Enough to save: a bank named somehow, and ten digits. */
export function bankReady(draft: BankDraft): boolean {
  return draft.bankName.trim() !== "" && isNuban(draft.accountNumber);
}

export function BankFields({
  value,
  onChange,
  showErrors = false,
}: {
  value: BankDraft;
  onChange: (next: BankDraft) => void;
  showErrors?: boolean;
}) {
  const banks = useAsync(
    (signal) => api.get<BanksResponse>("/public/marketing/banks", signal),
    [],
  );
  const list = banks.data?.banks ?? [];
  const canCheck = banks.data?.checked ?? false;

  const settled = useDebounced(value.accountNumber, 400);
  const check = useAsync(
    () =>
      canCheck && value.bankCode !== "" && isNuban(settled)
        ? api.post<ResolvedAccount>("/public/marketing/resolve-account", {
            bankCode: value.bankCode,
            bankName: value.bankName,
            accountNumber: settled,
          })
        : Promise.resolve(null),
    [canCheck, value.bankCode, value.bankName, settled],
  );

  const digits = value.accountNumber.length;
  const badNumber = showErrors && !isNuban(value.accountNumber);

  const wanted = canCheck && value.bankCode !== "" && isNuban(value.accountNumber);
  // Only an answer about the number on screen counts; the debounced one may be a digit behind.
  const answered = wanted && settled === value.accountNumber && !check.loading;
  const checking = wanted && !answered;
  const name =
    answered && check.data?.checked && check.data.accountName !== "" ? check.data.accountName : "";
  const unchecked = answered && name === "";

  return (
    <div className="space-y-4">
      {/* `group`, not `label`: a label wrapping a listbox makes every tap on a
          row also a tap on the label, and the combobox names itself anyway. */}
      <Field
        label="Your bank"
        as="group"
        error={showErrors && value.bankName.trim() === "" ? "Pick your bank." : undefined}
      >
        {list.length > 0 || banks.loading ? (
          <Combobox
            label="Your bank"
            placeholder="Type your bank's name"
            loading={banks.loading}
            invalid={showErrors && value.bankName.trim() === ""}
            value={value.bankCode}
            options={list.map((bank) => ({ value: bank.code, label: bank.name }))}
            emptyText="No bank by that name. Check the spelling, or try a shorter word."
            onPick={(choice) =>
              onChange({
                ...value,
                bankCode: choice?.value ?? "",
                bankName: choice?.label ?? "",
              })
            }
          />
        ) : (
          <input
            type="text"
            value={value.bankName}
            onChange={(event) => onChange({ ...value, bankName: event.target.value })}
            placeholder="Access Bank"
            autoComplete="off"
            className={`${inputCls} ${showErrors && value.bankName.trim() === "" ? "m-bad" : ""}`}
          />
        )}
      </Field>

      <Field
        label="Account number"
        hint={
          digits > 0 && digits < 10
            ? `${digits} of 10 digits`
            : "Ten digits, the one on your bank app."
        }
        error={badNumber ? "An account number is ten digits." : undefined}
      >
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value.accountNumber}
          onChange={(event) =>
            onChange({
              ...value,
              accountNumber: event.target.value.replace(/\D/gu, "").slice(0, 10),
            })
          }
          placeholder="0123456789"
          className={`m-num tracking-[0.14em] ${inputCls} ${badNumber ? "m-bad" : ""}`}
        />
      </Field>

      <div aria-live="polite">
        {checking && (
          <p className="flex items-center gap-2 text-[13px] font-medium text-m-muted">
            <Spin />
            Checking the name on that account.
          </p>
        )}

        {name !== "" && (
          <p className="m-tone-good flex items-start gap-2.5 rounded-[14px] px-3.5 py-3">
            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold opacity-85">Name on the account</span>
              <span className="mt-0.5 block text-[15px] font-bold tracking-[0.01em] [overflow-wrap:anywhere]">
                {name}
              </span>
            </span>
          </p>
        )}

        {unchecked && (
          <Note tone="warn">
            We could not check the name on that account right now. Read the number back to yourself
            before you save it, because that is where your money goes.
          </Note>
        )}
      </div>

      {!banks.loading && !canCheck && (
        <Note tone="warn">
          The bank name check is off on this site, so nobody can confirm the name for you. Check the
          number twice.
        </Note>
      )}
    </div>
  );
}

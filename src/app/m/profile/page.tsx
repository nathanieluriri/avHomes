"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Check, LogOut } from "lucide-react";
import {
  MARKETER_STATUS_LABEL,
  type Marketer,
  type MarketerBank,
  type MarketerStatus,
} from "@avhomes/contracts";
import { AppShell, useMarketer } from "@/components/marketer/AppShell";
import { CallRow } from "@/components/marketer/account/CallRow";
import { BankFields, bankReady, type BankDraft } from "@/components/marketer/BankFields";
import { IconBank, IconHelp } from "@/components/marketer/icons3d";
import { useHash, useSpotlight } from "@/components/marketer/team/share";
import {
  Button,
  Card,
  Chip,
  ErrorNote,
  Field,
  Note,
  PrimaryButton,
  RowGroup,
  SectionLabel,
  Skeleton,
  StatRow,
  PhoneField,
  inputCls,
  type ChipTone,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import {
  initials,
  type BankSaved,
  type MarketerResponse,
  type MeResponse,
} from "@/lib/marketer/api";
import { forgetAccount } from "@/lib/marketer/last-account";
import { NIGERIAN_STATES } from "@/lib/marketer/states";

/**
 * Your account: who you are, the bank account the money lands in, where to get
 * help, and the way out.
 *
 * The `bank-missing` and `bank-unchecked` alerts link here with `#bank`. The
 * section only exists once the read lands, so the browser's own jump to the
 * anchor finds nothing; the bank card scrolls itself into view and rings once
 * instead.
 *
 * Both forms are keyed on the record they were opened with, so a save that
 * returns a changed record remounts them with the new values rather than an
 * effect copying props into state.
 */

const STATUS_TONE: Record<MarketerStatus, ChipTone> = {
  active: "good",
  paused: "warn",
  banned: "bad",
};

function toApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

/** "012 345 6789": ten digits are easier to read back in three groups. */
function groupDigits(number: string): string {
  return number.length === 10 ? `${number.slice(0, 3)} ${number.slice(3, 6)} ${number.slice(6)}` : number;
}

/**
 * `me`, holding the last answer through a reload. The shared read goes back to
 * null while it reloads, which after every save flashed this screen to
 * skeletons and threw away the form's "Saved".
 */
function useHeldMe(): MeResponse | null {
  const { me } = useMarketer();
  const [held, setHeld] = useState(me);
  if (me !== null && me !== held) setHeld(me);
  return me ?? held;
}

export default function ProfilePage() {
  return (
    <AppShell title="Your account" back="/m" tab="Your details" hero={<AccountHero />}>
      <AccountBody />
    </AppShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════ HERO ══ */

function AccountHero() {
  const me = useHeldMe();

  if (!me) {
    return (
      <div className="mt-4 flex items-center gap-3.5" aria-hidden>
        <Skeleton onWine className="h-16 w-16" radius="999px" />
        <div className="min-w-0 flex-1">
          <Skeleton onWine className="h-5 w-40" />
          <Skeleton onWine className="mt-2 h-3.5 w-48" />
          <Skeleton onWine className="mt-2.5 h-6 w-36" radius="999px" />
        </div>
      </div>
    );
  }

  const { marketer } = me;
  return (
    <div className="mt-4 flex items-center gap-3.5">
      {/* The shared Avatar's initials are sized for 44px; this one is 64. */}
      <span
        aria-hidden
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/14 text-[21px] font-bold tracking-wide text-white ring-1 ring-white/25"
      >
        {initials(marketer.displayName, marketer.code)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[20px] font-bold leading-tight tracking-[-0.015em]">
          {marketer.displayName}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-white/72">{marketer.email}</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="m-num text-[14px] font-semibold tracking-[0.06em] text-white/90">
            {marketer.code}
          </span>
          <span aria-hidden className="h-4 w-px bg-white/25" />
          <Chip tone={STATUS_TONE[marketer.status]} dot>
            {MARKETER_STATUS_LABEL[marketer.status]}
          </Chip>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ BODY ══ */

function AccountBody() {
  const { error, reload } = useMarketer();
  const me = useHeldMe();

  if (error) {
    return (
      <div className="px-4">
        <ErrorNote error={error} onRetry={reload} />
      </div>
    );
  }
  if (!me) return <AccountSkeleton />;
  return <AccountReady me={me} reload={reload} />;
}

function AccountReady({ me, reload }: { me: MeResponse; reload: () => void }) {
  const { marketer } = me;
  const hash = useHash();
  const bankSpot = useSpotlight(hash === "#bank" ? "bank" : null, "start");
  // Held here, not in the form: the reload after a save remounts the form and would wipe it.
  const [saved, setSaved] = useState(false);
  // Same reason. A failed name check has to outlive the remount that follows it.
  const [bankMissed, setBankMissed] = useState("");
  const savedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  function detailsSaved() {
    setSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 2400);
    reload();
  }

  const reason =
    marketer.statusReason !== ""
      ? marketer.statusReason
      : marketer.status === "paused"
        ? "Your account is paused, so you cannot report a deal until AV Homes turns it back on."
        : "Your account has been closed.";

  return (
    <div className="space-y-7 px-4">
      <div className="space-y-3">
        {marketer.status !== "active" && (
          <Note tone={marketer.status === "banned" ? "bad" : "warn"}>{reason}</Note>
        )}
        <DetailsForm
          key={`details-${marketer.updatedAt}`}
          marketer={marketer}
          saved={saved}
          onSaved={detailsSaved}
        />
      </div>

      <section aria-labelledby="bank-title">
        <SectionLabel>
          <span id="bank-title">Bank account</span>
        </SectionLabel>
        {/* The id sits with the margin, so the shell's own jump to #bank and this ring land in one
            place, with the label still in view above the card. */}
        <div id="bank" ref={bankSpot} className="scroll-mt-[7.5rem] rounded-[1.5rem]">
          <BankCard
            key={`bank-${marketer.updatedAt}`}
            bank={marketer.bank}
            bankCheck={me.bankCheck}
            missed={bankMissed}
            onSaved={(detail) => {
              setBankMissed(detail);
              reload();
            }}
          />
        </div>
      </section>

      <section>
        <SectionLabel>Get help</SectionLabel>
        <RowGroup>
          <StatRow
            href="/m/help"
            lead={<IconHelp size={44} />}
            label="Help"
            sub="Short videos, and every step written out."
          />
          <CallRow phone={me.supportPhone} />
        </RowGroup>
      </section>

      <SignOutButton />
    </div>
  );
}

function DetailsForm({
  marketer,
  saved,
  onSaved,
}: {
  marketer: Marketer;
  /** A save just landed. Shown until the reader changes something again. */
  saved: boolean;
  onSaved: () => void;
}) {
  const stateList = useId();
  const [displayName, setDisplayName] = useState(marketer.displayName);
  const [phone, setPhone] = useState(marketer.phone);
  const [state, setState] = useState(marketer.state);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  // What the last save sent, so the fields count as saved before the fresh read remounts this form.
  const [sent, setSent] = useState<string | null>(null);

  const typed = [displayName.trim(), phone.trim(), state.trim()];
  const changed =
    typed[0] !== marketer.displayName || typed[1] !== marketer.phone || typed[2] !== marketer.state;
  const badName = displayName.trim().length < 2;
  const done = saved && (!changed || sent === typed.join("\n"));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.patch<MarketerResponse>("/marketing/me", {
        displayName: typed[0],
        phone: typed[1],
        state: typed[2],
      });
      setSent(typed.join("\n"));
      onSaved();
    } catch (err) {
      setError(toApiError(err));
    }
    setBusy(false);
  }

  return (
    <Card className="m-card--lg">
      <div className="space-y-4">
        <Field label="Your name" error={badName ? "Put in your full name." : undefined}>
          <input
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="name"
            className={`${inputCls} ${badName ? "m-bad" : ""}`}
          />
        </Field>

        <Field label="Phone" as="group">
          <PhoneField value={phone} onChange={setPhone} aria-label="Phone" />
        </Field>

        <Field label="State" hint="Where you mostly work.">
          <input
            type="text"
            value={state}
            list={stateList}
            onChange={(event) => setState(event.target.value)}
            placeholder="Lagos"
            autoComplete="address-level1"
            className={inputCls}
          />
          <datalist id={stateList}>
            {NIGERIAN_STATES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>

        {error && <ErrorNote error={error} onRetry={() => void save()} />}

        <Button
          size="lg"
          full
          disabled={!changed || badName || done}
          busy={busy}
          onClick={() => void save()}
        >
          {done ? (
            <>
              <Check className="h-5 w-5 text-(color:--m-good-fg)" strokeWidth={2.6} aria-hidden />
              Saved
            </>
          ) : (
            "Save changes"
          )}
        </Button>
        <span role="status" className="sr-only">
          {done ? "Your details are saved" : ""}
        </span>
      </div>
    </Card>
  );
}

function BankCard({
  bank,
  bankCheck,
  missed,
  onSaved,
}: {
  bank: MarketerBank | null;
  /** False when this site cannot check a name at all, so checking again would change nothing. */
  bankCheck: boolean;
  /** Why the last check found nothing, from the parent so a remount cannot wipe it. */
  missed: string;
  onSaved: (missed: string) => void;
}) {
  const [draft, setDraft] = useState<BankDraft>({
    bankCode: bank?.bankCode ?? "",
    bankName: bank?.bankName ?? "",
    accountNumber: bank?.accountNumber ?? "",
  });
  const [editing, setEditing] = useState(bank === null);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<"save" | "check" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  async function put(next: BankDraft, why: "save" | "check") {
    if (!bankReady(next)) {
      setShowErrors(true);
      return;
    }
    setBusy(why);
    setError(null);
    try {
      // Saving an account runs the bank's name check again on the server.
      const res = await api.put<BankSaved>("/marketing/me/bank", {
        bankCode: next.bankCode,
        bankName: next.bankName,
        accountNumber: next.accountNumber,
      });
      setEditing(false);
      /* The card is keyed on `updatedAt`, so this remounts it. The reason a
         check found nothing therefore has to go UP, or it dies with the
         component that learned it. */
      onSaved(res.checked ? "" : res.detail);
    } catch (err) {
      setError(toApiError(err));
    }
    setBusy(null);
  }

  if (!editing && bank) {
    const checked = bank.verifiedAt !== null;
    return (
      <Card padded={false} className="m-card--lg overflow-hidden">
        <div className="bg-[radial-gradient(95%_130%_at_100%_0%,rgb(255_140_175/0.11)_0%,transparent_62%)] p-4">
          <div className="flex items-center gap-3">
            <IconBank size={54} className="-my-1 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-m-muted">{bank.bankName}</p>
              <p className="m-num mt-0.5 text-[22px] font-bold tracking-[0.1em] text-m-text">
                {groupDigits(bank.accountNumber)}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-m-line pt-3.5">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-m-muted">Name on the account</p>
              <p className="mt-0.5 truncate text-[15px] font-bold text-m-text">
                {bank.accountName !== "" ? bank.accountName : "Not known yet"}
              </p>
            </div>
            <Chip tone={checked ? "good" : "warn"} dot>
              {checked ? "Checked" : "Not checked"}
            </Chip>
          </div>
        </div>

        <div className="space-y-3 border-t border-m-line p-4">
          {!checked && (
            <Note tone="warn">
              {bankCheck
                ? "The bank has not confirmed the name on this account yet. Make sure the number is right, then check it again."
                : "Nobody can confirm the name on this account on this site. Make sure the number is right."}
            </Note>
          )}
          {error && <ErrorNote error={error} />}
          {missed !== "" && <Note tone="bad">{missed}</Note>}
          {!checked && bankCheck && (
            <PrimaryButton
              busy={busy === "check"}
              disabled={busy !== null}
              onClick={() =>
                void put(
                  { bankCode: bank.bankCode, bankName: bank.bankName, accountNumber: bank.accountNumber },
                  "check",
                )
              }
            >
              Check the name again
            </PrimaryButton>
          )}
          <Button
            variant="secondary"
            size="lg"
            full
            disabled={busy !== null}
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            Change bank account
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="m-card--lg">
      {bank === null ? (
        <div className="mb-5 flex items-center gap-3">
          <IconBank size={56} className="-my-1 shrink-0" />
          <div className="min-w-0">
            <p className="text-[16px] font-bold leading-snug text-m-text">
              Add the account we pay into
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-m-muted">
              We cannot pay you without it.
            </p>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-[16px] font-bold leading-snug text-m-text">
          Change the account we pay into
        </p>
      )}

      <BankFields value={draft} onChange={setDraft} showErrors={showErrors} />

      {error && (
        <div className="mt-4">
          <ErrorNote error={error} onRetry={() => void put(draft, "save")} />
        </div>
      )}

      <div className="mt-5 space-y-2.5">
        <PrimaryButton busy={busy === "save"} onClick={() => void put(draft, "save")}>
          Save this account
        </PrimaryButton>
        {bank && (
          <Button
            variant="secondary"
            size="lg"
            full
            onClick={() => {
              setDraft({
                bankCode: bank.bankCode,
                bankName: bank.bankName,
                accountNumber: bank.accountNumber,
              });
              setShowErrors(false);
              setError(null);
              setEditing(false);
            }}
          >
            Leave it as it was
          </Button>
        )}
      </div>
    </Card>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function out() {
    setBusy(true);
    try {
      await api.post("/auth/logout");
    } catch {
      // A logout the server did not hear is still a logout here: the next
      // screen asks for the session again and bounces if it is still alive.
    }
    // The name comes off the phone too. Signing out and still being greeted by
    // name is the opposite of what somebody handing over their phone wants.
    forgetAccount();
    router.replace("/m/sign-in");
  }

  return (
    <Button variant="danger" size="lg" full busy={busy} onClick={() => void out()}>
      <LogOut className="h-5 w-5" aria-hidden />
      Sign out
    </Button>
  );
}

/** The details card and the bank card, in the shape they land in. */
function AccountSkeleton() {
  return (
    <div className="space-y-7 px-4" aria-hidden>
      <div className="m-card m-card--lg space-y-4 p-4">
        {[0, 1, 2].map((field) => (
          <div key={field}>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-1.5 h-[50px]" radius="14px" />
          </div>
        ))}
        <Skeleton className="h-[52px]" radius="16px" />
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-32" />
        <Skeleton className="h-40" radius="24px" />
      </div>
    </div>
  );
}

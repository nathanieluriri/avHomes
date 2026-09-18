"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ComponentType } from "react";
import { ChevronLeft, Phone } from "lucide-react";
import { AuthDoor, DoorTitle, OtherDoor, PasswordInput } from "./account/AuthFrame";
import { BankFields, EMPTY_BANK, bankReady, type BankDraft } from "./BankFields";
import {
  IconBank,
  IconCheckBadge,
  IconInvite,
  IconMoney,
  IconPayDay,
  IconShield,
  type IconProps,
} from "./icons3d";
import {
  Button,
  ButtonLink,
  Card,
  ErrorNote,
  Field,
  Note,
  PrimaryButton,
  Skeleton,
  Stepper,
  inputCls,
} from "./ui";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import type { JoinInfo, MarketerResponse } from "@/lib/marketer/api";
import { rememberAccount } from "@/lib/marketer/last-account";
import { NIGERIAN_STATES } from "@/lib/marketer/states";

/**
 * Signing up, in three steps. The first screen a new marketer ever sees.
 *
 * The bank comes second rather than last because it is the step people abandon,
 * and abandoning it at the very end means abandoning the account. Put before the
 * promises it can also be skipped honestly: the API takes a marketer with no
 * bank on file, and the app asks for one until there is.
 *
 * The three promises sit in the hero, where the page is judged in a glance, and
 * again in full as the last thing read before the account is made.
 */

const STEPS = ["About you", "Your bank", "Almost done"] as const;

const PROMISES: readonly {
  Icon: ComponentType<IconProps>;
  short: string;
  title: string;
  body: string;
}[] = [
  {
    Icon: IconMoney,
    short: "Free to join",
    title: "Joining is free",
    body: "You never pay AV Homes anything to be here, and nobody may ask you to.",
  },
  {
    Icon: IconCheckBadge,
    short: "Real deals only",
    title: "You earn from real deals only",
    body: "Money comes from a home that was really sold or rented, and that we have checked. Never from somebody signing up.",
  },
  {
    Icon: IconPayDay,
    short: "Paid every month",
    title: "We pay at the end of every month",
    body: "Whatever is approved by then goes to your bank account in one transfer.",
  },
];

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/iu.test(value.trim());
}

function toApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export function JoinFlow({ code }: { code: string }) {
  const router = useRouter();
  const stateList = useId();
  const stepTop = useRef<HTMLDivElement>(null);

  const info = useAsync(
    (signal) =>
      api.get<JoinInfo>(
        `/public/marketing/join${code === "" ? "" : `?code=${encodeURIComponent(code)}`}`,
        signal,
      ),
    [code],
  );

  const [step, setStep] = useState(1);
  const [showErrors, setShowErrors] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
  const [password, setPassword] = useState("");
  const [bank, setBank] = useState<BankDraft>(EMPTY_BANK);
  const [skipBank, setSkipBank] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const badName = showErrors && displayName.trim().length < 2;
  const badEmail = showErrors && !looksLikeEmail(email);
  const badPhone = showErrors && phone.trim().length < 7;
  const badPassword = showErrors && password.length < 8;

  const youOk =
    displayName.trim().length >= 2 &&
    looksLikeEmail(email) &&
    phone.trim().length >= 7 &&
    password.length >= 8;

  function go(next: number) {
    setShowErrors(false);
    setError(null);
    setStep(next);
    // The next step starts at its own top, not wherever the last one was scrolled to.
    stepTop.current?.scrollIntoView({ block: "start" });
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api.post<MarketerResponse>("/public/marketing/join", {
        displayName: displayName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        state: state.trim(),
        password,
        referrerCode: code,
        ...(bankReady(bank) && !skipBank
          ? {
              bank: {
                bankCode: bank.bankCode,
                bankName: bank.bankName,
                accountNumber: bank.accountNumber,
              },
            }
          : {}),
      });
      // The join route issues the session, so the app is already signed in.
      rememberAccount({ name: displayName.trim(), email: email.trim() });
      router.replace("/m");
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  }

  if (info.data && !info.data.open) {
    return (
      <AuthDoor
        back="/m/sign-in"
        head={
          <DoorTitle
            title="Not taking new people right now"
            hint="Sign ups are paused for a while. Everybody already in keeps working."
          />
        }
        foot={<OtherDoor question="Already have an account?" href="/m/sign-in" action="Sign in" />}
      >
        <Card className="m-card--lg">
          <div className="flex items-center gap-3.5">
            <IconShield size={60} className="-my-1 shrink-0" />
            <p className="min-w-0 text-[14px] leading-relaxed text-m-muted">
              If somebody told you to join, call them and ask when it opens again.
            </p>
          </div>
          {info.data.supportPhone !== "" && (
            <ButtonLink
              href={`tel:${info.data.supportPhone.replace(/\s+/gu, "")}`}
              external
              variant="secondary"
              size="lg"
              full
              className="mt-4"
            >
              <Phone className="h-[18px] w-[18px]" aria-hidden />
              Call AV Homes
            </ButtonLink>
          )}
        </Card>
      </AuthDoor>
    );
  }

  const referrer = info.data?.referrer ?? null;

  return (
    <AuthDoor
      back="/m/sign-in"
      head={
        <>
          <DoorTitle
            title="Earn on every home"
            hint="Bring a buyer or a tenant to AV Homes, and take a share of the deal."
          />
          {/* On the flat ground these are raised cards, not glass: there is no
              wine behind them for a translucent tile to lift. */}
          <ul className="mt-5 grid grid-cols-3 gap-2.5" aria-label="What joining means">
            {PROMISES.map(({ Icon, short }) => (
              <li
                key={short}
                className="flex flex-col items-center gap-1 rounded-[18px] bg-m-card px-1.5 pb-2.5 pt-2 text-center"
              >
                <Icon size={44} />
                <span className="text-[12px] font-semibold leading-tight text-m-text">{short}</span>
              </li>
            ))}
          </ul>
        </>
      }
      foot={<OtherDoor question="Already have an account?" href="/m/sign-in" action="Sign in" />}
    >
      <div className="space-y-5">
        {code !== "" && info.loading && <Skeleton className="h-[92px]" radius="24px" />}

        {referrer && <InvitedBy name={referrer.displayName} />}

        {code !== "" && info.data && !referrer && (
          <Note tone="warn">
            We do not know that invite link, so nobody will be credited for inviting you. You can
            still join.
          </Note>
        )}

        <div ref={stepTop} className="flex scroll-mt-4 items-center gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => go(step - 1)}
              aria-label={`Back to ${STEPS[step - 2]}`}
              className="m-press m-tap grid h-10 w-10 shrink-0 place-items-center rounded-full bg-m-raised text-m-text ring-1 ring-m-line active:bg-m-line"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <Stepper step={step} labels={STEPS} />
          </div>
        </div>

        {step === 1 && (
          <Card className="m-card--lg">
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (!youOk) {
                  setShowErrors(true);
                  return;
                }
                go(2);
              }}
            >
              <Field label="Your name" error={badName ? "Put in your full name." : undefined}>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  placeholder="Ada Nwachukwu"
                  className={`${inputCls} ${badName ? "m-bad" : ""}`}
                />
              </Field>

              <Field label="Email" error={badEmail ? "Check that email address." : undefined}>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  autoCapitalize="off"
                  placeholder="you@example.com"
                  className={`${inputCls} ${badEmail ? "m-bad" : ""}`}
                />
              </Field>

              <Field label="Phone" error={badPhone ? "Put in a phone number we can call." : undefined}>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  placeholder="0803 000 0000"
                  className={`m-num ${inputCls} ${badPhone ? "m-bad" : ""}`}
                />
              </Field>

              <Field label="State" hint="Where you mostly work.">
                <input
                  type="text"
                  value={state}
                  list={stateList}
                  onChange={(event) => setState(event.target.value)}
                  autoComplete="address-level1"
                  placeholder="Lagos"
                  className={inputCls}
                />
                <datalist id={stateList}>
                  {NIGERIAN_STATES.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </Field>

              <Field
                label="Password"
                hint="Eight letters or more."
                error={badPassword ? "Make it at least eight letters." : undefined}
                as="group"
              >
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  placeholder="Something only you know"
                  bad={badPassword}
                />
              </Field>

              <PrimaryButton type="submit">Next</PrimaryButton>
            </form>
          </Card>
        )}

        {step === 2 && (
          <Card className="m-card--lg">
            <div className="mb-5 flex items-center gap-3">
              <IconBank size={56} className="-my-1 shrink-0" />
              <div className="min-w-0">
                <p className="text-[16px] font-bold leading-snug text-m-text">
                  Where should your money go?
                </p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-m-muted">
                  We pay into this account at the end of every month. Nothing is ever taken out.
                </p>
              </div>
            </div>
            <BankFields value={bank} onChange={setBank} showErrors={showErrors && !skipBank} />
            <div className="mt-5 space-y-2.5">
              <PrimaryButton
                onClick={() => {
                  if (!bankReady(bank)) {
                    setShowErrors(true);
                    return;
                  }
                  setSkipBank(false);
                  go(3);
                }}
              >
                Next
              </PrimaryButton>
              <Button
                variant="secondary"
                size="lg"
                full
                onClick={() => {
                  setSkipBank(true);
                  go(3);
                }}
              >
                Add my bank later
              </Button>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="m-card--lg">
            <p className="text-[16px] font-bold leading-snug text-m-text">
              Three things, then you are in
            </p>
            <ul className="mt-4 space-y-4">
              {PROMISES.map(({ Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <Icon size={48} className="-mt-1 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold leading-snug text-m-text">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-m-muted">
                      {body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            {skipBank && (
              <div className="mt-5">
                <Note tone="warn">
                  You have not added a bank account. Add one from Account in the menu before pay
                  day, or we cannot send you anything.
                </Note>
              </div>
            )}

            {error && (
              <div className="mt-4">
                <ErrorNote error={error} onRetry={() => void create()} />
              </div>
            )}

            <div className="mt-5">
              <PrimaryButton busy={busy} onClick={() => void create()}>
                Create my account
              </PrimaryButton>
            </div>
          </Card>
        )}
      </div>

    </AuthDoor>
  );
}

/** Who sent the link, on a warm card, so the page feels like an invitation rather than a form. */
function InvitedBy({ name }: { name: string }) {
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-[linear-gradient(140deg,#4d2231_0%,#2c1b20_58%,#241519_100%)] p-4 shadow-[inset_0_0_0_1px_rgb(255_206_160/0.14),inset_0_1px_0_0_rgb(255_255_255/0.06),var(--m-drop)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(circle,rgb(255_190_130/0.2)_0%,transparent_70%)]"
      />
      <div className="relative flex items-center gap-3.5">
        <IconInvite size={60} className="-my-1 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#ffd29e]">Invited by</p>
          <p className="truncate text-[19px] font-bold leading-snug tracking-[-0.01em] text-m-text">
            {name}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-m-muted">You join their team.</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import { MARKETER_STATUS_LABEL, type TeamMember } from "@avhomes/contracts";
import { AppShell, useMarketer } from "@/components/marketer/AppShell";
import { IconInvite, IconTeam } from "@/components/marketer/icons3d";
import { pct, sameRates } from "@/components/marketer/team/bits";
import {
  ButtonLink,
  Card,
  Chip,
  EmptyState,
  ErrorNote,
  RowGroup,
  Segmented,
  Skeleton,
} from "@/components/marketer/ui";
import { api, type ApiError } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { initials, type MeResponse, type TeamResponse } from "@/lib/marketer/api";

/**
 * Your team: who joined through you, in three steps and no more, and how each
 * step pays you, read off the live rates.
 *
 * The counts ride the hero rather than the tabs. At 360px a label such as
 * "One more step (12)" is wider than its third of the control.
 */

type Level = "1" | "2" | "3";

const LEVELS: readonly { value: Level; label: string; hint: string }[] = [
  { value: "1", label: "You invited", hint: "People who joined on your link." },
  { value: "2", label: "They invited", hint: "People invited by somebody you invited." },
  { value: "3", label: "One more step", hint: "People invited by their people. It stops here." },
];

const JOINED = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

/** Wine, gold, lilac and rose: the icon set's materials, so a list of faces is not one flat colour. */
const TINTS = [
  "bg-[#3d1520] text-[#ff8fa3]",
  "bg-[#3a2912] text-[#ffcf7d]",
  "bg-[#2a2140] text-[#cfc4fa]",
  "bg-[#4a2530] text-[#f2dee3]",
];

function tintFor(code: string): string {
  let sum = 0;
  for (const char of code) sum += char.charCodeAt(0);
  return TINTS[sum % TINTS.length];
}

type TeamRead = {
  data: TeamResponse | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
};

export default function TeamPage() {
  const team = useAsync((signal) => api.get<TeamResponse>("/marketing/team", signal), []);

  return (
    <AppShell title="Your team" back="/m" tab="Your people" hero={<TeamHero team={team} />}>
      <TeamBody team={team} />
    </AppShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════ HERO ══ */

function TeamHero({ team }: { team: TeamRead }) {
  const { me } = useMarketer();
  // The home read already carries the counts, so the hero fills before the list does.
  const levels = team.data?.levels ?? me?.levels ?? null;

  if (!levels) {
    return (
      <div aria-hidden>
        <Skeleton onWine className="mt-4 h-11 w-40" radius="12px" />
        <Skeleton onWine className="mt-5 h-[76px]" radius="18px" />
      </div>
    );
  }

  const total = levels[0] + levels[1] + levels[2];
  return (
    <>
      <p className="mt-3 flex items-baseline gap-2">
        <span className="m-num text-[46px] font-bold leading-none tracking-[-0.035em]">{total}</span>
        <span className="text-[16px] font-semibold text-white/80">
          {total === 1 ? "person" : "people"}
        </span>
      </p>
      <dl className="m-glass mt-4 grid grid-cols-3 divide-x divide-white/15 rounded-[18px] py-3">
        {LEVELS.map((level, index) => (
          <div key={level.value} className="flex flex-col-reverse items-center px-1 text-center">
            <dt className="mt-1 text-[12px] font-medium leading-tight text-white/75">{level.label}</dt>
            <dd className="m-num text-[26px] font-bold leading-none tracking-[-0.02em]">
              {levels[index]}
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════ BODY ══ */

function TeamBody({ team }: { team: TeamRead }) {
  const { me } = useMarketer();
  const [level, setLevel] = useState<Level>("1");

  const levels = team.data?.levels ?? [0, 0, 0];
  const total = levels[0] + levels[1] + levels[2];
  const members = (team.data?.members ?? []).filter((member) => String(member.level) === level);
  const current = LEVELS.find((option) => option.value === level) ?? LEVELS[0];

  let people: ReactNode;
  if (team.error) {
    people = <ErrorNote error={team.error} onRetry={team.reload} />;
  } else if (!team.data) {
    people = (
      <>
        <Skeleton className="h-11" radius="999px" />
        <Skeleton className="mx-1 mt-3 h-3.5 w-3/5" />
        <RowGroup className="mt-3">
          <MemberRowSkeleton />
          <MemberRowSkeleton />
          <MemberRowSkeleton />
        </RowGroup>
      </>
    );
  } else if (total === 0) {
    people = (
      <EmptyState
        art={<IconInvite size={104} />}
        title="Your team starts with one invite"
        hint="Send your link to somebody who knows people looking for a home. When they close a deal, you earn too."
        action={
          <ButtonLink href="/m/invite" size="lg">
            Invite people
          </ButtonLink>
        }
      />
    );
  } else {
    people = (
      <>
        <Segmented value={level} options={LEVELS} onChange={setLevel} label="Which people" />
        <p className="mt-3 px-1 text-[13px] leading-relaxed text-m-muted">{current.hint}</p>
        <div className="mt-3">
          {members.length === 0 ? (
            <EmptyState
              compact
              art={<IconTeam size={48} />}
              title="Nobody here yet"
              hint={
                level === "2"
                  ? "This fills up when the people you invited bring in their own people."
                  : "This fills up when their people invite somebody."
              }
            />
          ) : (
            <RowGroup>
              {members.map((member) => (
                <MemberRow key={member.id} member={member} />
              ))}
            </RowGroup>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-7 px-4">
      <section aria-label="Your people">{people}</section>
      <HowItPays me={me} />
    </div>
  );
}

/**
 * One person under you. The right column carries the deal count and nothing
 * else: every word added there comes straight out of the name at 360px.
 *
 * Drawn here rather than with StatRow, whose line under the label is cut to one
 * line: at 360px that cut "Invited by" off before the name it is there to give.
 */
function MemberRow({ member }: { member: TeamMember }) {
  const first = member.underName.trim().split(/\s+/u)[0] ?? "";
  const extra =
    member.level === 1
      ? member.teamCount > 0
        ? ` · ${member.teamCount} in their team`
        : ""
      : first !== ""
        ? ` · Invited by ${first}`
        : "";

  return (
    <div className="flex w-full items-center gap-3 px-4 py-3.5">
      <span
        aria-hidden
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-[14px] font-bold tracking-wide ${tintFor(member.code)}`}
      >
        {initials(member.displayName, member.code)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 truncate text-[15px] font-semibold text-m-text">
            {member.displayName}
          </span>
          {member.status !== "active" && (
            <Chip tone={member.status === "banned" ? "bad" : "warn"}>
              {MARKETER_STATUS_LABEL[member.status]}
            </Chip>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-m-muted">
          {`Joined ${JOINED.format(new Date(member.joinedAt))}${extra}`}
        </span>
      </span>
      <span className="block min-w-10 shrink-0 text-right">
        <span className="m-num block text-[18px] font-bold leading-none text-m-text">
          {member.dealCount}
        </span>
        <span className="mt-1 block text-[11px] font-medium text-m-muted">
          {member.dealCount === 1 ? "deal" : "deals"}
        </span>
      </span>
    </div>
  );
}

/** A member row before it arrives: a round face, two lines and the count. */
function MemberRowSkeleton() {
  return (
    <div aria-hidden className="flex items-center gap-3 px-4 py-3.5">
      <Skeleton className="h-11 w-11 shrink-0" radius="999px" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-2 h-3 w-3/4" />
      </div>
      <div className="flex w-10 flex-col items-end">
        <Skeleton className="h-[18px] w-5" />
        <Skeleton className="mt-1.5 h-2.5 w-8" />
      </div>
    </div>
  );
}

/** The three steps as a chain, each with the share it pays you. */
function HowItPays({ me }: { me: MeResponse | null }) {
  const sale = me?.rates.sale;
  const rent = me?.rates.rent;

  const steps = sale
    ? [
        {
          rate: pct(sale[0]),
          title: "You close a deal yourself",
          line: "Your own share of a home you sold or rented.",
          tone: "bg-[linear-gradient(180deg,#c24a6b_0%,#8a2342_100%)] text-white shadow-[inset_0_1px_0_0_rgb(255_214_226/0.45)]",
        },
        {
          rate: pct(sale[1]),
          title: "Somebody you invited closes one",
          line: `On top of their own ${pct(sale[0])}, not taken from it.`,
          tone: "bg-(--m-act-bg) text-(--m-act-fg) ring-1 ring-[#5a2233]",
        },
        {
          rate: pct(sale[2]),
          title: "One of their people closes one",
          line: "That is as far as it goes.",
          tone: "bg-m-raised text-m-text ring-1 ring-m-line",
        },
      ]
    : null;

  return (
    <section aria-labelledby="how-it-pays">
      <Card className="m-card--lg">
        <div className="flex items-center gap-3">
          <IconTeam size={64} className="-my-2 -ml-1 shrink-0" />
          <div className="min-w-0">
            <h2 id="how-it-pays" className="text-[17px] font-bold leading-snug text-m-text">
              How your team earns you money
            </h2>
            <p className="mt-0.5 text-[13px] text-m-muted">Three steps, and no more.</p>
          </div>
        </div>

        <ol className="mt-5">
          {steps
            ? steps.map((step, index) => (
                <li key={step.title} className="relative flex gap-3.5 pb-5 last:pb-0">
                  {index < steps.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute bottom-0 left-[23px] top-12 w-0.5 rounded-full bg-m-line"
                    />
                  )}
                  <span
                    className={`m-num grid h-12 w-12 shrink-0 place-items-center rounded-full text-[15px] font-bold ${step.tone}`}
                  >
                    {step.rate}
                  </span>
                  <span className="min-w-0 flex-1 pt-1">
                    <span className="block text-[15px] font-semibold leading-snug text-m-text">
                      {step.title}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-m-muted">
                      {step.line}
                    </span>
                  </span>
                </li>
              ))
            : [0, 1, 2].map((row) => (
                <li key={row} className="flex gap-3.5 pb-5 last:pb-0" aria-hidden>
                  <Skeleton className="h-12 w-12" radius="999px" />
                  <span className="min-w-0 flex-1 pt-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="mt-2 h-3 w-1/2" />
                  </span>
                </li>
              ))}
        </ol>

        {sale && rent && !sameRates(sale, rent) && (
          <p className="mt-4 text-[13px] leading-relaxed text-m-muted">
            For a rented home it is {pct(rent[0])}, {pct(rent[1])} and {pct(rent[2])}.
          </p>
        )}

        <p className="mt-5 border-t border-m-line pt-4 text-[13px] leading-relaxed text-m-muted">
          Nobody earns from somebody joining. Only a real home, sold or rented and checked by AV
          Homes, pays anybody.
        </p>
      </Card>
    </section>
  );
}

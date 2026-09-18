"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Phone, RefreshCw, Send } from "lucide-react";
import { formatMoney, formatPhone, type Deal, type DealShare } from "@avhomes/contracts";
import { AppShell, useMarketer, useReportBlock } from "@/components/marketer/AppShell";
import {
  DealStatusChip,
  couldEarn,
  kindWord,
  shareSource,
  stillOpen,
} from "@/components/marketer/deals/DealStatus";
import { PhotoGallery } from "@/components/marketer/deals/PhotoGallery";
import {
  ProofPicker,
  toApiError,
  useProofUploads,
} from "@/components/marketer/deals/ProofPicker";
import {
  IconCheckBadge,
  IconDeals,
  IconMoney,
  IconPhoto,
  IconShield,
} from "@/components/marketer/icons3d";
import { Amount, EyeButton } from "@/components/marketer/money/Amount";
import {
  Button,
  ButtonLink,
  EmptyState,
  ErrorNote,
  Field,
  Note,
  PrimaryButton,
  RowGroup,
  SectionLabel,
  SectionLink,
  Skeleton,
  inputCls,
} from "@/components/marketer/ui";
import { ApiError, api } from "@/lib/admin/client";
import { fullDate, shortDate } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import { maskMoney, useMoneyHidden } from "@/lib/marketer/prefs";

/**
 * One deal: what it pays this marketer, the facts, the proof, and the admin's
 * reason when there is one.
 *
 * It is where the "needs more info" alert lands, so a deal sent back carries
 * the whole answer on this screen: the reason, new photos, a note, and Send it
 * back, which puts the deal straight back to Being checked.
 */

interface DealView {
  deal: Deal;
  myShare: DealShare | null;
}

type SectionKey = "sent" | "ask" | "why" | "money" | "facts" | "proof" | "note";

/** A level 2 or 3 share means somebody else reported it. No share at all means it is yours. */
function isMine(view: DealView): boolean {
  return !view.myShare || view.myShare.level === 1;
}

/** The sections in the order this deal's state makes them matter. The first one rides the tab. */
function plan(view: DealView, justSent: boolean): { key: SectionKey; label: string }[] {
  const { deal } = view;
  const mine = isMine(view);
  const asking = deal.status === "info" && mine;
  const out: { key: SectionKey; label: string }[] = [];

  if (justSent) out.push({ key: "sent", label: "Sent back" });
  if (asking) out.push({ key: "ask", label: "Do this" });
  if (deal.status === "rejected") out.push({ key: "why", label: "Why it was not approved" });
  if (deal.status === "cancelled") out.push({ key: "why", label: "Why it was cancelled" });
  if (deal.status === "approved" || stillOpen(deal.status)) {
    out.push({ key: "money", label: "Your money" });
  }
  out.push({ key: "facts", label: "The deal" });
  // A deal being answered shows its photos inside the form, where they can be changed.
  if (!asking && deal.proof.length > 0) {
    out.push({ key: "proof", label: mine ? "Proof you sent" : "Proof" });
  }
  if (mine && deal.note.trim() !== "") out.push({ key: "note", label: "Your note" });
  return out;
}

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const read = useAsync(
    (signal) => api.get<DealView>(`/marketing/deals/${encodeURIComponent(id)}`, signal),
    [id],
  );
  // The resubmit answers with the deal as it now stands, so the screen shows that without a reload.
  const [answered, setAnswered] = useState<{ id: string; view: DealView } | null>(null);
  const justSent = answered !== null && answered.id === id;
  const view = justSent ? answered.view : read.data;

  const missing = read.error?.status === 404;
  const sections = view ? plan(view, justSent) : [];
  const deal = view?.deal;

  const tab = view ? (
    sections[0]?.label
  ) : read.error ? (
    missing ? "Not found" : "The deal"
  ) : (
    <Skeleton className="h-5 w-32" />
  );

  return (
    <AppShell
      back="/m/deals"
      title={deal?.listingTitle}
      hint={deal?.listingLocation || undefined}
      hero={<DealHero deal={deal} loading={!view && !read.error} />}
      tab={tab}
    >
      <div className="px-4">
        {read.error && !justSent ? (
          missing ? (
            <EmptyState
              art={<IconDeals size={88} />}
              title="We cannot find that deal"
              hint="It may have been removed, or it was reported by somebody outside your team."
              action={
                <ButtonLink href="/m/deals" size="lg" variant="secondary">
                  See your deals
                </ButtonLink>
              }
            />
          ) : (
            <ErrorNote error={read.error} onRetry={read.reload} />
          )
        ) : !view ? (
          <BodySkeleton />
        ) : (
          <DealBody
            view={view}
            sections={sections}
            onAnswered={(next) => setAnswered({ id, view: next })}
            onStale={() => {
              setAnswered(null);
              read.reload();
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════ HERO ══ */

function DealHero({ deal, loading }: { deal: Deal | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div aria-hidden>
        <Skeleton onWine className="mt-5 h-9 w-3/4" radius="12px" />
        <Skeleton onWine className="mt-3 h-4 w-1/2" />
        <div className="mt-4 flex gap-2">
          <Skeleton onWine className="h-[26px] w-28" radius="999px" />
          <Skeleton onWine className="h-[26px] w-32" radius="999px" />
        </div>
      </div>
    );
  }
  if (!deal) return null;

  const when = deal.closedOn > 0 ? deal.closedOn : deal.createdAt;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <DealStatusChip status={deal.status} />
      <span className="m-glass inline-flex h-[26px] items-center rounded-full px-2.5 text-[12px] font-semibold">
        {kindWord(deal.listingType)} on {shortDate(when)}
      </span>
    </div>
  );
}

function BodySkeleton() {
  return (
    <div aria-hidden className="space-y-7">
      <div className="m-card flex items-start gap-3.5 p-4">
        <Skeleton className="h-14 w-14" radius="16px" />
        <div className="flex-1">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="mt-2.5 h-7 w-40" />
          <Skeleton className="mt-3 h-3 w-4/5" />
        </div>
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-24" />
        <RowGroup>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex justify-between px-4 py-3.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </RowGroup>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ BODY ══ */

function DealBody({
  view,
  sections,
  onAnswered,
  onStale,
}: {
  view: DealView;
  sections: { key: SectionKey; label: string }[];
  onAnswered: (next: DealView) => void;
  onStale: () => void;
}) {
  const nodes: Record<SectionKey, () => ReactNode> = {
    sent: () => <SentCard />,
    ask: () => <NeedsMore deal={view.deal} onAnswered={onAnswered} onStale={onStale} />,
    why: () => <WhyCard deal={view.deal} />,
    money: () => <Earnings view={view} />,
    facts: () => <Facts view={view} />,
    proof: () => (
      <PhotoGallery urls={view.deal.proof} name={isMine(view) ? "Proof you sent" : "Proof photo"} />
    ),
    note: () => (
      <p className="m-card whitespace-pre-wrap px-4 py-3.5 text-[14px] leading-relaxed text-m-text [overflow-wrap:anywhere]">
        {view.deal.note}
      </p>
    ),
  };

  return (
    <div className="space-y-7">
      {sections.map((section, index) => (
        <section key={section.key} aria-label={index === 0 ? section.label : undefined}>
          {/* The first section's name is already on the tab above it. */}
          {index > 0 && <SectionLabel>{section.label}</SectionLabel>}
          {nodes[section.key]()}
        </section>
      ))}
    </div>
  );
}

/** Shown once, right after Send it back, where the form was. */
function SentCard() {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The form the reader was at the bottom of is gone. Take them to its answer.
    card.current?.focus({ preventScroll: true });
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
  }, []);

  return (
    <div
      ref={card}
      role="status"
      tabIndex={-1}
      className="m-card flex items-start gap-3.5 p-4 outline-none"
    >
      <span aria-hidden className="-ml-1 shrink-0">
        <IconCheckBadge size={52} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-bold leading-snug text-m-text">We got it</p>
        <p className="mt-1 text-[14px] leading-relaxed text-m-muted">
          AV Homes will check it again, usually in a day or two. You will get an alert when they
          decide.
        </p>
      </div>
    </div>
  );
}

function Earnings({ view }: { view: DealView }) {
  const { me } = useMarketer();
  const [hidden] = useMoneyHidden();
  const { deal, myShare } = view;
  const mask = (text: string) => (hidden ? maskMoney(text) : text);
  const total = formatMoney(deal.amountMinor, deal.currency);

  if (deal.status === "approved") {
    if (!myShare) {
      return (
        <MoneyCard
          icon={<IconShield size={56} />}
          caption="You earned"
          figure={<Amount minor={0} currency={deal.currency} size="lg" className="text-[30px]" />}
          line="This deal was approved without a share for you. Call AV Homes if that looks wrong."
        />
      );
    }
    return (
      <MoneyCard
        icon={<IconCheckBadge size={56} />}
        caption="You earned"
        figure={
          <Amount minor={myShare.amountMinor} currency={deal.currency} size="lg" className="text-[30px]" />
        }
        line={mask(`${myShare.rate}% of ${total}. ${shareSource(myShare)}.`)}
        foot={<SectionLink href="/m/money">See when it is paid</SectionLink>}
      />
    );
  }

  const estimate = couldEarn(deal.amountMinor, deal.listingType, me?.rates);
  return (
    <MoneyCard
      icon={<IconMoney size={56} />}
      caption="You could earn"
      figure={
        estimate ? (
          <Amount minor={estimate.minor} currency={deal.currency} size="lg" className="text-[30px]" />
        ) : (
          <Skeleton className="mt-1 h-8 w-36" />
        )
      }
      line={
        estimate
          ? mask(`${estimate.rate}% of ${total}, once AV Homes approves it.`)
          : "Working it out."
      }
    />
  );
}

function MoneyCard({
  icon,
  caption,
  figure,
  line,
  foot,
}: {
  icon: ReactNode;
  caption: string;
  figure: ReactNode;
  line: string;
  foot?: ReactNode;
}) {
  return (
    <div className="m-card p-4">
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="-ml-1 shrink-0">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-m-muted">{caption}</p>
            <span className="-my-2 -mr-1.5">
              <EyeButton />
            </span>
          </div>
          <p className="mt-1 text-m-text">{figure}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-m-muted">{line}</p>
        </div>
      </div>
      {foot && <div className="mt-3 flex justify-end border-t border-m-line pt-3">{foot}</div>}
    </div>
  );
}

function WhyCard({ deal }: { deal: Deal }) {
  const { me } = useMarketer();
  const refused = deal.status === "rejected";
  const phone = me?.supportPhone ?? "";
  const reason =
    deal.reason.trim() ||
    (refused ? "AV Homes did not say why." : "AV Homes cancelled this deal and did not say why.");

  return (
    <div className="m-card p-4">
      <div className="flex items-start gap-3.5">
        <span aria-hidden className="-ml-1 shrink-0">
          <IconShield size={52} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-bold leading-snug text-m-text">
            {refused ? "AV Homes did not approve this deal" : "AV Homes cancelled this deal"}
          </p>
          <p className="mt-1 text-[13px] text-m-muted">Nothing is paid on it.</p>
        </div>
      </div>
      <div className="m-tone-bad mt-3.5 rounded-[14px] px-3.5 py-3">
        <p className="text-[12px] font-semibold opacity-80">What they said</p>
        <p className="mt-1 text-[14.5px] font-semibold leading-relaxed [overflow-wrap:anywhere]">
          {reason}
        </p>
      </div>
      {phone !== "" && (
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <p className="text-[13px] text-m-muted">Think this is wrong?</p>
          <ButtonLink href={`tel:${phone.replace(/\s/gu, "")}`} external variant="secondary" size="sm">
            <Phone className="h-4 w-4" aria-hidden />
            Call AV Homes
          </ButtonLink>
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="shrink-0 text-[14px] text-m-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-[15px] font-semibold text-m-text">
        {children}
      </span>
    </div>
  );
}

function Facts({ view }: { view: DealView }) {
  const { deal } = view;
  const mine = isMine(view);
  return (
    <RowGroup>
      <Fact label="What happened">{kindWord(deal.listingType)}</Fact>
      <Fact label="What they paid">
        <Amount minor={deal.amountMinor} currency={deal.currency} size="md" />
      </Fact>
      {deal.closedOn > 0 && <Fact label="Date it was done">{fullDate(deal.closedOn)}</Fact>}
      <Fact label="Reported">{fullDate(deal.createdAt)}</Fact>
      {!mine && (
        <Fact label="Closed by">
          {deal.reporterName}
          <span className="m-num ml-1.5 text-[13px] font-medium text-m-muted">{deal.reporterCode}</span>
        </Fact>
      )}
      {mine && deal.buyerName !== "" && <Fact label="Buyer">{deal.buyerName}</Fact>}
      {mine && deal.buyerPhone !== "" && (
        <Fact label="Buyer phone">
          <a href={`tel:${deal.buyerPhone.replace(/\s/gu, "")}`} className="m-link m-num">
            {formatPhone(deal.buyerPhone)}
          </a>
        </Fact>
      )}
    </RowGroup>
  );
}

/* ══════════════════════════════════════════════════════════ SEND IT BACK ══ */

const KEEP_ONE = "Keep at least one photo.";

function NeedsMore({
  deal,
  onAnswered,
  onStale,
}: {
  deal: Deal;
  onAnswered: (next: DealView) => void;
  onStale: () => void;
}) {
  const uploads = useProofUploads(deal.proof);
  const { me } = useMarketer();
  // The shared sentence is about reporting; here the thing refused is sending more proof.
  const blocked = useReportBlock()
    ? me?.marketer.status === "paused"
      ? "Your account is paused, so you cannot send more proof for now. The deal waits as it is."
      : "Your account is closed, so you cannot send more proof."
    : null;
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // New photos only ever append, so a shorter list with none new means one was taken out.
  const fresh = uploads.items.some((item) => item.fresh);
  const changed = fresh || uploads.items.length !== deal.proof.length || note.trim() !== "";
  const problem =
    uploads.items.length === 0 ? KEEP_ONE : changed ? null : "Add a new photo or a note first.";
  // The admin decided while this form was open, so there is nothing left to answer.
  const decided = error?.status === 409;

  async function send() {
    setTried(true);
    if (problem || uploads.sending) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.post<DealView>(
        `/marketing/deals/${encodeURIComponent(deal.id)}/resubmit`,
        { proof: uploads.urls, note: note.trim() },
      );
      onAnswered(next);
    } catch (err) {
      setError(toApiError(err));
      setBusy(false);
    }
  }

  return (
    <div className="m-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start gap-3.5">
          <span aria-hidden className="-ml-1 shrink-0">
            <IconPhoto size={52} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-bold leading-snug text-m-text">
              AV Homes needs more from you
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-m-muted">
              They need it before they can approve this deal.
            </p>
          </div>
        </div>
        <div className="m-tone-act mt-3.5 rounded-[14px] px-3.5 py-3">
          <p className="text-[12px] font-semibold opacity-80">What they said</p>
          <p className="mt-1 text-[14.5px] font-semibold leading-relaxed [overflow-wrap:anywhere]">
            {deal.reason.trim() || "Send more proof so they can approve this deal."}
          </p>
        </div>
      </div>

      {/* The API refuses a paused or closed account's photos and its send, so say so instead. */}
      {blocked ? (
        <div className="space-y-3 border-t border-m-line px-4 pb-4 pt-4">
          <Note tone="warn">{blocked}</Note>
          <ButtonLink href="/m/help" variant="secondary" size="lg" full>
            Get help
          </ButtonLink>
        </div>
      ) : (
        <div className="space-y-5 border-t border-m-line px-4 pb-4 pt-4">
          <ProofPicker
            uploads={uploads}
            label="Add more proof"
            hint="Up to five photos in all. Remove one that is not clear."
            error={tried && problem === KEEP_ONE ? KEEP_ONE : undefined}
            markNew
          />

          <Field label="Add a note" hint="Not required. Say what you changed.">
            <textarea
              value={note}
              rows={3}
              maxLength={600}
              onChange={(event) => setNote(event.target.value)}
              placeholder="This slip shows the date and the full amount."
              className={`${inputCls} resize-none`}
            />
          </Field>

          {tried && problem !== null && problem !== KEEP_ONE && (
            <p role="alert" className="text-[13px] font-medium text-(color:--m-bad-fg)">
              {problem}
            </p>
          )}

          {error &&
            (decided ? (
              <div role="alert" className="m-tone-bad rounded-[16px] p-4">
                <p className="text-[14px] font-semibold">{error.message}</p>
                <Button variant="secondary" size="sm" onClick={onStale} className="mt-3">
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  See where it stands
                </Button>
              </div>
            ) : (
              <ErrorNote error={error} onRetry={() => void send()} />
            ))}

          <PrimaryButton
            busy={busy}
            disabled={uploads.sending !== null}
            onClick={() => void send()}
          >
            {!busy && <Send className="h-5 w-5" aria-hidden />}
            {busy ? "Sending it back" : "Send it back"}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}

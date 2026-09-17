"use client";

import { useState } from "react";
import { Check, Copy, Maximize2, Share2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import { joinLink } from "@avhomes/contracts";
import { AppShell, useMarketer } from "@/components/marketer/AppShell";
import { Sheet } from "@/components/marketer/Sheet";
import { IconInvite, IconMoney, IconTeam } from "@/components/marketer/icons3d";
import { QrCode } from "@/components/marketer/team/QrCode";
import { HeroArt, HeroHint, RuleLine, pct, sameRates } from "@/components/marketer/team/bits";
import {
  openWhatsApp,
  shareOrWhatsApp,
  useCanShare,
  useCopy,
  useOrigin,
} from "@/components/marketer/team/share";
import {
  Button,
  Card,
  ErrorNote,
  Note,
  RowGroup,
  SectionLabel,
  Skeleton,
  StatRow,
} from "@/components/marketer/ui";
import type { MeResponse } from "@/lib/marketer/api";

/**
 * Invite people: the link, the ways to send it, and what joining means for both
 * sides, read off the live rates.
 *
 * The `no-team` alert lands here, so the share card is the first thing under
 * the tab and needs no scroll to reach WhatsApp on a 360px phone.
 */

const INVITE_TEXT = "Join AV Homes with me and earn money on every home you help sell or rent.";

export default function InvitePage() {
  return (
    <AppShell
      title="Invite people"
      back="/m"
      tab="Your link"
      hero={
        <>
          <HeroArt>
            <IconInvite size={92} />
          </HeroArt>
          <HeroHint>Everyone who joins on your link is in your team.</HeroHint>
        </>
      }
    >
      <InviteBody />
    </AppShell>
  );
}

function InviteBody() {
  const { me, error, reload } = useMarketer();

  if (error) {
    return (
      <div className="px-4">
        <ErrorNote error={error} onRetry={reload} />
      </div>
    );
  }
  if (!me) return <InviteSkeleton />;
  return <InviteReady me={me} />;
}

/** The address as a person reads it: no scheme in front. */
function shortLink(link: string): string {
  return link.replace(/^https?:\/\//u, "");
}

function InviteReady({ me }: { me: MeResponse }) {
  const origin = useOrigin();
  const canShare = useCanShare();
  const [copied, copy] = useCopy();
  const [big, setBig] = useState(false);

  const { marketer } = me;
  const link = origin === "" ? "" : joinLink(origin, marketer.code);
  const people = me.levels[0] + me.levels[1] + me.levels[2];

  return (
    <div className="space-y-7 px-4">
      <section aria-label="Share your link">
        {marketer.status !== "active" && (
          <div className="mb-3">
            <Note tone="warn">
              Your account is {marketer.status === "paused" ? "paused" : "closed"}, so anyone who
              joins on your link right now is not put in your team.
            </Note>
          </div>
        )}

        <Card padded={false} className="m-card--lg overflow-hidden">
          <div className="flex items-center gap-4 p-4">
            {/* Nothing is drawn over the code: a badge on its corner covers modules a scanner needs. */}
            <button
              type="button"
              onClick={() => setBig(true)}
              disabled={link === ""}
              aria-haspopup="dialog"
              aria-label="Show the QR code bigger"
              tabIndex={-1}
              className="m-press shrink-0 rounded-[16px] shadow-[0_14px_30px_-18px_rgb(0_0_0/0.9)]"
            >
              {link === "" ? (
                <Skeleton className="h-[132px] w-[132px]" radius="16px" />
              ) : (
                <QrCode value={link} size={132} label={`QR code that opens ${shortLink(link)}`} />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[17px] font-bold leading-snug text-m-text">Scan to join</p>
              <p className="mt-1 text-[13px] leading-relaxed text-m-muted">
                Hold it up to their phone camera.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={link === ""}
                aria-haspopup="dialog"
                onClick={() => setBig(true)}
              >
                <Maximize2 className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                Make it bigger
              </Button>
            </div>
          </div>

          <div className="space-y-3 border-t border-m-line p-4">
            <div className="flex min-h-12 items-center gap-2 rounded-[14px] bg-m-raised py-1.5 pl-3.5 pr-1.5 ring-1 ring-m-line">
              <span className="m-num min-w-0 flex-1 truncate text-[14px] text-m-text">
                {link === "" ? " " : shortLink(link)}
              </span>
              <Button
                variant="quiet"
                size="sm"
                disabled={link === ""}
                onClick={() => copy(link)}
                aria-label={copied ? "Link copied" : "Copy your link"}
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <span role="status" className="sr-only">
              {copied ? "Link copied" : ""}
            </span>

            <div className="flex gap-3">
              <Button
                variant="whatsapp"
                size="lg"
                className="min-w-0 flex-1"
                disabled={link === ""}
                onClick={() => openWhatsApp(`${INVITE_TEXT} Start here: ${link}`)}
              >
                <FaWhatsapp className="h-5 w-5 shrink-0" aria-hidden />
                Send on WhatsApp
              </Button>
              {canShare && (
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-[52px] shrink-0 px-0"
                  disabled={link === ""}
                  aria-label="Share another way"
                  onClick={() =>
                    void shareOrWhatsApp({ title: "Join AV Homes", text: INVITE_TEXT, url: link })
                  }
                >
                  <Share2 className="h-5 w-5" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </Card>
      </section>

      <Perks me={me} />

      <section>
        <SectionLabel>Your team so far</SectionLabel>
        <RowGroup>
          <StatRow
            href="/m/team"
            lead={<IconTeam size={44} />}
            label="Your team"
            sub={people === 0 ? "Nobody has joined yet" : "See who joined"}
            value={
              <span className="m-num text-[17px] font-bold text-m-text">
                {people}
                <span className="ml-1 text-[12px] font-semibold text-m-muted">
                  {people === 1 ? "person" : "people"}
                </span>
              </span>
            }
          />
        </RowGroup>
      </section>

      <Sheet
        open={big && link !== ""}
        onClose={() => setBig(false)}
        title="Scan to join"
        hint="Hold this up to their phone camera. It opens your link."
      >
        <div className="flex flex-col items-center pb-2">
          <QrCode
            value={link}
            size={300}
            label={`QR code that opens ${shortLink(link)}`}
            className="h-auto w-full max-w-[18.75rem]"
          />
          <p className="m-num mt-4 text-[15px] font-semibold tracking-[0.06em] text-m-text">
            {marketer.code}
          </p>
          <Button variant="secondary" size="lg" full className="mt-5" onClick={() => setBig(false)}>
            Done
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** What joining means for them and for you, in plain rules and the live rates. */
function Perks({ me }: { me: MeResponse }) {
  const { sale, rent } = me.rates;
  const same = sameRates(sale, rent);

  return (
    <>
      <section>
        <SectionLabel>What they get</SectionLabel>
        <Card className="m-card--lg">
          <div className="flex items-center gap-3.5">
            <IconMoney size={60} className="-my-1 shrink-0" />
            <div className="min-w-0">
              <p className="m-num text-[28px] font-bold leading-none tracking-[-0.02em] text-m-text">
                {pct(sale[0])}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-m-muted">
                {same
                  ? "of every deal they close themselves"
                  : `of every sale they close, and ${pct(rent[0])} of every rent`}
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5 border-t border-m-line pt-4">
            <RuleLine>No joining fee. Nobody pays anything to be here.</RuleLine>
            <RuleLine>They earn on real deals only, once AV Homes has checked them.</RuleLine>
            <RuleLine>Paid into their own bank account at the end of every month.</RuleLine>
          </ul>
        </Card>
      </section>

      <section>
        <SectionLabel>What you get</SectionLabel>
        <Card className="m-card--lg">
          <div className="flex items-center gap-3.5">
            <IconTeam size={60} className="-my-1 shrink-0" />
            <div className="min-w-0">
              <p className="m-num text-[28px] font-bold leading-none tracking-[-0.02em] text-m-text">
                {pct(sale[1])}
                <span className="mx-1.5 text-[18px] font-semibold text-m-muted">+</span>
                {pct(sale[2])}
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-m-muted">
                of the deals your team closes
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2.5 border-t border-m-line pt-4">
            <RuleLine>
              {pct(sale[1])} of every deal closed by somebody you invited.
            </RuleLine>
            <RuleLine>
              {pct(sale[2])} of every deal closed by the people they invite. It stops there.
            </RuleLine>
            {!same && (
              <RuleLine>
                On a rented home it is {pct(rent[1])} and {pct(rent[2])}.
              </RuleLine>
            )}
            <RuleLine>Nothing for sign ups. Real deals only, paid with the rest of your money every month.</RuleLine>
          </ul>
        </Card>
      </section>
    </>
  );
}

function InviteSkeleton() {
  return (
    <div className="space-y-7 px-4" aria-hidden>
      <div className="m-card m-card--lg overflow-hidden">
        <div className="flex items-center gap-4 p-4">
          <Skeleton className="h-[132px] w-[132px]" radius="16px" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="mt-2 h-3.5 w-full" />
            <Skeleton className="mt-3 h-6 w-20" radius="999px" />
          </div>
        </div>
        <div className="space-y-3 border-t border-m-line p-4">
          <Skeleton className="h-12" radius="14px" />
          <Skeleton className="h-[52px]" radius="16px" />
        </div>
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-32" />
        <Skeleton className="h-44" radius="24px" />
      </div>
    </div>
  );
}

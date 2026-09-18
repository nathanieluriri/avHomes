"use client";

import Image from "next/image";
import { useState, type ComponentType } from "react";
import { ChevronRight, Play } from "lucide-react";
import type { TutorialId, TutorialProgress, TutorialProgressList } from "@avhomes/contracts";
import { AppShell, useMarketer } from "@/components/marketer/AppShell";
import { VideoSheet } from "@/components/marketer/VideoSheet";
import { CallRow } from "@/components/marketer/account/CallRow";
import {
  IconCheckBadge,
  IconHandshake,
  IconHelp,
  IconInvite,
  IconMoney,
  IconPayDay,
  IconReport,
  type IconProps,
} from "@/components/marketer/icons3d";
import { HeroArt, HeroHint } from "@/components/marketer/team/bits";
import {
  Card,
  Chip,
  ErrorNote,
  RowGroup,
  SectionLabel,
  Skeleton,
} from "@/components/marketer/ui";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import {
  HELP_TOPICS,
  PROGRESS_PATH,
  aboutLength,
  putWithRetry,
  type HelpTopic,
} from "@/lib/marketer/help";

/**
 * Help: a short video per job, and the same thing written out under it.
 *
 * Every piece of this screen works before a single video exists. A topic whose
 * video has not been rendered keeps its card, shows its 3D icon where the
 * poster would be, and opens a sheet of written steps. Nothing here waits on
 * `public/tutorials/`.
 *
 * The paused alert sends people here, so a person to call sits at the bottom.
 */

const TOPIC_ICON: Partial<Record<TutorialId, ComponentType<IconProps>>> = {
  "report-a-deal": IconReport,
  "invite-and-earn": IconInvite,
  "log-a-buyer": IconHandshake,
};

/** How the money moves, in the order it moves. */
const PAY_STEPS: readonly { Icon: ComponentType<IconProps>; title: string; line: string }[] = [
  { Icon: IconReport, title: "Report the deal", line: "With your proof: the agreement or the receipt." },
  { Icon: IconCheckBadge, title: "AV Homes checks it", line: "It usually takes a day or two." },
  { Icon: IconMoney, title: "It lands in your money", line: "Your share waits there for pay day." },
  { Icon: IconPayDay, title: "Paid at the end of the month", line: "Everybody is paid together, into their bank." },
];

export default function HelpPage() {
  return (
    <AppShell
      title="Help"
      back="/m"
      tab="Watch and learn"
      hero={
        <>
          <HeroArt>
            <IconHelp size={92} />
          </HeroArt>
          <HeroHint>Short videos, with every step written out.</HeroHint>
        </>
      }
    >
      <HelpBody />
    </AppShell>
  );
}

function HelpBody() {
  const { me } = useMarketer();
  const progress = useAsync(
    (signal) => api.get<TutorialProgressList>(PROGRESS_PATH, signal),
    [],
  );
  // Watches this visit stored. Set only once the server has them, so nothing rolls back.
  const [saved, setSaved] = useState<Record<string, true>>({});
  const [broken, setBroken] = useState<Record<string, true>>({});
  const [open, setOpen] = useState<HelpTopic | null>(null);

  /** Null while the answer is not in, so no card claims a state it does not know. */
  function watchedOf(id: TutorialId): boolean | null {
    if (saved[id]) return true;
    if (!progress.data) return null;
    return progress.data.items.some(
      (row: TutorialProgress) => row.tutorialId === id && row.watchedAt !== null,
    );
  }

  async function markWatched(id: TutorialId) {
    if (watchedOf(id) === true) return;
    try {
      await putWithRetry(`${PROGRESS_PATH}/${id}`, { watched: true });
      setSaved((all) => ({ ...all, [id]: true }));
    } catch {
      // Nothing to say here. The card stays as it was and the video can be watched again.
    }
  }

  return (
    <div className="space-y-7 px-4">
      <section aria-label="Watch and learn">
        {progress.error && (
          <div className="mb-3">
            <ErrorNote error={progress.error} onRetry={progress.reload} />
          </div>
        )}
        <div className="space-y-3">
          {HELP_TOPICS.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              watched={watchedOf(topic.id)}
              busy={progress.loading}
              posterBroken={topic.id in broken}
              onPosterError={() => setBroken((all) => ({ ...all, [topic.id]: true }))}
              onOpen={() => setOpen(topic)}
            />
          ))}
        </div>
      </section>

      <section>
        <SectionLabel>How you get paid</SectionLabel>
        <Card className="m-card--lg">
          <ol>
            {PAY_STEPS.map(({ Icon, title, line }, index) => (
              <li key={title} className="relative flex gap-3.5 pb-5 last:pb-0">
                {index < PAY_STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute bottom-1 left-[23px] top-[3.25rem] w-0.5 rounded-full bg-m-line"
                  />
                )}
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-m-raised ring-1 ring-m-line">
                  <Icon size={40} />
                </span>
                <span className="min-w-0 flex-1 pt-1">
                  <span className="block text-[15px] font-semibold leading-snug text-m-text">
                    <span className="sr-only">{`Step ${index + 1}: `}</span>
                    {title}
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-m-muted">
                    {line}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      <section>
        <SectionLabel>Talk to a person</SectionLabel>
        <RowGroup>
          {me ? (
            <CallRow phone={me.supportPhone} />
          ) : (
            <div className="flex items-center gap-3 px-4 py-3.5" aria-hidden>
              <Skeleton className="h-11 w-11" radius="999px" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
            </div>
          )}
        </RowGroup>
      </section>

      {open && (
        <VideoSheet
          key={open.id}
          topic={open}
          posterBroken={open.id in broken}
          onClose={() => setOpen(null)}
          onWatched={() => void markWatched(open.id)}
        />
      )}
    </div>
  );
}

/**
 * One topic: a thumbnail, what it is for, how long it takes, and where you got to.
 *
 * The thumbnail slot is portrait and keeps its size whether or not a poster
 * exists, so the card does not change shape the day the videos land. Portrait,
 * because these are recordings of this app on a phone.
 */
function TopicCard({
  topic,
  watched,
  busy,
  posterBroken,
  onPosterError,
  onOpen,
}: {
  topic: HelpTopic;
  /** Null when the progress read has not answered, or answered with a failure. */
  watched: boolean | null;
  /** That read is still in flight, so the unknown state is worth shimmering for. */
  busy: boolean;
  posterBroken: boolean;
  onPosterError: () => void;
  onOpen: () => void;
}) {
  const { poster, seconds } = topic;
  const showPoster = poster !== null && seconds !== null && !posterBroken;
  const length = seconds === null ? `${topic.steps.length} steps to read` : aboutLength(seconds);
  const Icon = TOPIC_ICON[topic.id] ?? IconHelp;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label={`${topic.title}. ${topic.problem} ${length}.`}
      className="m-card m-card--lg m-press m-press-light flex w-full items-center gap-3.5 p-3 text-left"
    >
      <span
        className={`relative grid h-[108px] w-[66px] shrink-0 place-items-center overflow-hidden rounded-[14px] ${
          showPoster
            ? "bg-[#0b0507]"
            : "bg-[radial-gradient(90%_60%_at_50%_100%,rgb(194_74_107/0.22)_0%,transparent_100%),#2c1b20] ring-1 ring-m-line"
        }`}
      >
        {showPoster ? (
          <>
            <Image
              src={poster}
              alt=""
              fill
              sizes="66px"
              onError={onPosterError}
              className="object-cover"
            />
            <span className="relative grid h-8 w-8 place-items-center rounded-full bg-white/92 text-[#7a2140] shadow-[0_6px_14px_-6px_rgb(0_0_0/0.8)]">
              <Play className="ml-px h-3.5 w-3.5" fill="currentColor" aria-hidden />
            </span>
          </>
        ) : (
          <Icon size={54} />
        )}
      </span>

      <span className="min-w-0 flex-1 py-1">
        <span className="block text-[16px] font-bold leading-snug text-m-text">{topic.title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-m-muted">{topic.problem}</span>
        <span className="mt-2.5 flex flex-wrap items-center gap-2">
          {/* No chip at all when the read failed. A shimmer that never ends is
              worse than saying nothing about a state nobody can act on. */}
          {watched !== null ? (
            <Chip tone={watched ? "good" : "neutral"}>{watched ? "Watched" : "Not watched"}</Chip>
          ) : busy ? (
            <Skeleton className="h-[26px] w-24" radius="999px" />
          ) : null}
          <span className="text-[12px] font-semibold text-m-faint">{length}</span>
        </span>
      </span>

      <ChevronRight className="mr-1 h-5 w-5 shrink-0 text-m-faint" aria-hidden />
    </button>
  );
}

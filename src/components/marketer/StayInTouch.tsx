"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { BellRing, Check, ChevronRight, PlusSquare, Share } from "lucide-react";
import { IconAlerts } from "./icons3d";
import { Sheet } from "./Sheet";
import { Button, Chip, Note, RowGroup, SectionLabel, StatRow } from "./ui";
import { useAppBadge, useNotificationRouting, usePush } from "@/lib/push";
import { useInstall } from "@/lib/install";

/**
 * Getting AV Homes onto the phone: notifications on, and the app on the home
 * screen. Four surfaces, one state:
 *
 *  - a sheet the first time somebody lands on Home, and again a fortnight later
 *    if they said not now and it is still off;
 *  - cards in Home's alert strip and rows on Alerts while it is off, because a
 *    sheet seen once is a sheet forgotten;
 *  - the switch on Account, where it is turned off again.
 *
 * Every state comes from `usePush` and `useInstall`, so all four agree.
 */

const ASKED_KEY = "avhomes.welcome.m";
const ASK_AGAIN_MS = 14 * 24 * 60 * 60 * 1000;

/** The app's own home screen icon, so the card shows what will be on their phone. */
function AppIcon({ size }: { size: number }) {
  return (
    <Image
      src="/pwa/m-192.png"
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[22%] shadow-[0_4px_14px_rgb(0_0_0/0.35)]"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════ GUIDES ══ */

/** The only way onto an iPhone's home screen. Safari has no install prompt to call. */
function IosSteps() {
  const steps: { icon: ReactNode; text: ReactNode }[] = [
    {
      icon: <Share className="h-[18px] w-[18px]" aria-hidden />,
      text: (
        <>
          Tap <b className="text-m-text">Share</b>. In Safari it is at the bottom of the screen.
        </>
      ),
    },
    {
      icon: <PlusSquare className="h-[18px] w-[18px]" aria-hidden />,
      text: (
        <>
          Scroll down and tap <b className="text-m-text">Add to Home Screen</b>, then <b className="text-m-text">Add</b>.
        </>
      ),
    },
    {
      icon: <BellRing className="h-[18px] w-[18px]" aria-hidden />,
      text: (
        <>
          Open <b className="text-m-text">AV Partners</b> from your Home Screen and turn notifications on there.
        </>
      ),
    },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-m-raised text-m-text">
            {step.icon}
          </span>
          <span className="pt-1.5 text-[14px] leading-relaxed text-m-muted">{step.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** Blocked is the browser's decision, and only its settings undo it. */
function BlockedSteps({ installed }: { installed: boolean }) {
  return (
    <div className="space-y-3 text-[14px] leading-relaxed text-m-muted">
      {installed ? (
        <p>
          Press and hold the <b className="text-m-text">AV Partners</b> icon, tap <b className="text-m-text">App info</b>,
          then <b className="text-m-text">Notifications</b>, and switch them on.
        </p>
      ) : (
        <p>
          Tap the icon to the left of the web address, then <b className="text-m-text">Permissions</b> or{" "}
          <b className="text-m-text">Site settings</b>, and set <b className="text-m-text">Notifications</b> to Allow.
        </p>
      )}
      <p>Come back here afterwards and they switch on by themselves.</p>
    </div>
  );
}

type Guide = "ios" | "blocked" | null;

function GuideSheet({ guide, onClose, installed }: { guide: Guide; onClose: () => void; installed: boolean }) {
  return (
    <Sheet
      open={guide !== null}
      onClose={onClose}
      title={guide === "ios" ? "Add AV Partners to your Home Screen" : "Allow notifications"}
      hint={
        guide === "ios"
          ? "iPhone only sends notifications to apps on the Home Screen. It takes three taps."
          : "This phone has blocked notifications from AV Homes."
      }
    >
      <div className="pb-2">{guide === "ios" ? <IosSteps /> : <BlockedSteps installed={installed} />}</div>
      <Button variant="secondary" size="lg" full className="mt-5" onClick={onClose}>
        Got it
      </Button>
    </Sheet>
  );
}

/* ════════════════════════════════════════════════════════ THE ONE STATE ══ */

export interface DeviceAsk {
  id: "notifications" | "install";
  icon: ReactNode;
  title: string;
  body: string;
  action: string;
  run: () => void;
  busy: boolean;
}

/**
 * What this phone still needs, in the order it matters: notifications first,
 * because they are how a decision about money reaches somebody, then the icon.
 * On iPhone both are the same three taps, so they are one ask.
 */
export function useDeviceAsks(): { asks: DeviceAsk[]; guide: ReactNode; error: string | null } {
  const push = usePush("m");
  const install = useInstall();
  const [guide, setGuide] = useState<Guide>(null);
  const asks: DeviceAsk[] = [];

  if (push.status === "needs-install") {
    asks.push({
      id: "notifications",
      icon: <IconAlerts size={64} />,
      title: "Get notifications on iPhone",
      body: "Add the app to your Home Screen, then turn them on there.",
      action: "Show me how",
      run: () => setGuide("ios"),
      busy: false,
    });
  } else if (push.status === "off") {
    asks.push({
      id: "notifications",
      icon: <IconAlerts size={64} />,
      title: "Turn on notifications",
      body: "Hear the moment a deal is approved or money is sent.",
      action: "Turn on",
      run: () => void push.enable(),
      busy: push.busy,
    });
  } else if (push.status === "denied") {
    asks.push({
      id: "notifications",
      icon: <IconAlerts size={64} />,
      title: "Notifications are blocked",
      body: "Allow them for AV Homes so a decision about your money reaches you.",
      action: "How to allow",
      run: () => setGuide("blocked"),
      busy: false,
    });
  }

  if (install.offerable && push.status !== "needs-install") {
    asks.push({
      id: "install",
      icon: <AppIcon size={52} />,
      title: "Install the app",
      body: "Open AV Partners from your home screen, like any other app.",
      action: install.ios ? "Show me how" : "Install",
      run: () => (install.ios ? setGuide("ios") : void install.prompt()),
      busy: false,
    });
  }

  return {
    asks,
    error: push.error,
    guide: <GuideSheet guide={guide} onClose={() => setGuide(null)} installed={install.installed} />,
  };
}

/**
 * Mounted once by the shell for a signed-in partner: keeps this phone's
 * subscription current on every visit, routes a tapped notification, and keeps
 * the home screen icon's number to the alerts that need doing.
 */
export function PushKeeper({ alertCount }: { alertCount: number | undefined }) {
  usePush("m");
  useNotificationRouting();
  useAppBadge(alertCount);
  return null;
}

/* ════════════════════════════════════════════════════════════ SURFACES ══ */

/** One ask in Home's alert strip, drawn as an alert card but acting in place. */
export function DeviceAskCard({ ask }: { ask: DeviceAsk }) {
  return (
    <button
      type="button"
      onClick={ask.run}
      disabled={ask.busy}
      className="m-alert-card m-press m-press-light text-left"
    >
      <span className="flex items-start justify-between gap-2">
        <span aria-hidden className={ask.id === "install" ? "ml-0.5 mt-1" : "-ml-1.5 -mt-1"}>
          {ask.icon}
        </span>
        <Chip tone="heads-up">This phone</Chip>
      </span>
      <span className="mt-1.5 line-clamp-3 text-[15px] font-bold leading-snug text-m-text">{ask.title}</span>
      <span className="mt-1 text-[13px] leading-snug text-m-muted">{ask.body}</span>
      <span className="m-link mt-auto flex items-center gap-0.5 pt-3 text-[13px]">
        {ask.busy ? "Turning on" : ask.action}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </span>
    </button>
  );
}

/** The same asks at the top of Alerts, as rows. Nothing when the phone is set up. */
export function DeviceAskRows({ className = "" }: { className?: string }) {
  const { asks, guide, error } = useDeviceAsks();
  if (asks.length === 0) return guide;
  return (
    <section className={className}>
      <SectionLabel>
        This phone
        <Chip tone="heads-up" className="m-num">
          {asks.length}
        </Chip>
      </SectionLabel>
      <ul className="m-card divide-y divide-m-line overflow-hidden">
        {asks.map((ask) => (
          <li key={ask.id}>
            <button
              type="button"
              onClick={ask.run}
              disabled={ask.busy}
              className="m-press m-press-light flex w-full items-start gap-3 px-4 py-4 text-left"
            >
              <span aria-hidden className="-mt-0.5 shrink-0">
                {ask.id === "install" ? <AppIcon size={40} /> : <IconAlerts size={44} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-snug text-m-text">{ask.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-m-muted">{ask.body}</span>
                <span className="mt-3 flex justify-end">
                  <span className="m-btn m-btn--secondary h-8 shrink-0 gap-0.5 rounded-full pl-3.5 pr-2.5 text-[13px]">
                    {ask.busy ? "Turning on" : ask.action}
                    <ChevronRight className="h-4 w-4 opacity-80" aria-hidden />
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <div className="mt-3">
          <Note tone="bad">{error}</Note>
        </div>
      )}
      {guide}
    </section>
  );
}

function readAsked(): number {
  try {
    return Number(localStorage.getItem(ASKED_KEY) ?? "0") || 0;
  } catch {
    return Date.now();
  }
}

function writeAsked(): void {
  try {
    localStorage.setItem(ASKED_KEY, String(Date.now()));
  } catch {
    // Private mode: it asks again next visit, which is the honest fallback.
  }
}

/**
 * The first visit to Home: one sheet, both asks, a way to say not now. It waits
 * a moment so the screen behind it has drawn and they can see where they are.
 */
export function WelcomeSheet() {
  const { asks, guide, error } = useDeviceAsks();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const pending = asks.length > 0;

  useEffect(() => {
    if (!pending) return;
    if (Date.now() - readAsked() < ASK_AGAIN_MS) return;
    const timer = window.setTimeout(() => {
      writeAsked();
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // Rows that were acted on stay in the sheet as done rather than vanishing under the thumb.
  const [shown, setShown] = useState<DeviceAsk[]>([]);
  if (open && shown.length === 0 && asks.length > 0) setShown(asks);
  const live = new Map(asks.map((ask) => [ask.id, ask] as const));
  const rows = shown.map((ask) => live.get(ask.id) ?? ask);
  const allDone = rows.length > 0 && rows.every((row) => !live.has(row.id) || done.includes(row.id));

  return (
    <>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Stay in the loop"
        hint="AV Homes tells you the moment something happens to your deals and your money."
      >
        {/* Not StatRow: its line truncates, and here the line is the reason to say yes. */}
        <RowGroup>
          {rows.map((row) => {
            const finished = !live.has(row.id);
            return (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3.5">
                <span aria-hidden className="shrink-0">
                  {row.id === "install" ? <AppIcon size={40} /> : <IconAlerts size={44} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug text-m-text">{row.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-m-muted">
                    {finished ? (row.id === "install" ? "Installed." : "On. You will hear from us.") : row.body}
                  </span>
                </span>
                {finished ? (
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgb(52_199_89/0.18)] text-[#4cd97b]">
                    <Check className="h-4 w-4" aria-hidden />
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant={row.id === "notifications" ? "primary" : "secondary"}
                    busy={row.busy}
                    onClick={() => {
                      row.run();
                      setDone((list) => [...list, row.id]);
                    }}
                  >
                    {row.action}
                  </Button>
                )}
              </div>
            );
          })}
        </RowGroup>
        {error && (
          <div className="mt-3">
            <Note tone="bad">{error}</Note>
          </div>
        )}
        <Button
          variant={allDone ? "primary" : "secondary"}
          size="lg"
          full
          className="mt-5"
          onClick={() => setOpen(false)}
        >
          {allDone ? "Done" : "Not now"}
        </Button>
        <p className="mt-3 pb-1 text-center text-[12px] text-m-faint">You can change this any time under Account.</p>
      </Sheet>
      {guide}
    </>
  );
}

/** Account's Notifications section: the switch for this phone, a test, and the icon. */
export function NotificationsSection() {
  const push = usePush("m");
  const install = useInstall();
  const [guideFor, setGuideFor] = useState<Guide>(null);
  const [tested, setTested] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  if (push.status === "unsupported" && !install.offerable) return null;

  async function test() {
    setTesting(true);
    setTested(null);
    try {
      const result = await push.test();
      setTested(
        result?.outcome === "delivered" || result?.outcome === "partial"
          ? "Sent. It should land in a few seconds."
          : "It did not go through. Turn notifications off and on again.",
      );
    } catch {
      setTested("It did not go through. Check your connection and try again.");
    } finally {
      setTesting(false);
    }
  }

  const status: Record<typeof push.status, { chip: string; tone: "good" | "neutral" | "warn" | "bad" }> = {
    checking: { chip: "Checking", tone: "neutral" },
    on: { chip: "On", tone: "good" },
    off: { chip: "Off", tone: "neutral" },
    denied: { chip: "Blocked", tone: "bad" },
    "needs-install": { chip: "Needs the app", tone: "warn" },
    unsupported: { chip: "Not on this browser", tone: "neutral" },
  };

  return (
    <section aria-labelledby="notify-title">
      <SectionLabel>
        <span id="notify-title">Notifications</span>
      </SectionLabel>
      <RowGroup>
        <StatRow
          lead={<IconAlerts size={44} />}
          label="On this phone"
          sub={
            push.status === "on"
              ? "Deals, money and replies."
              : push.status === "denied"
                ? "Blocked in settings."
                : push.status === "needs-install"
                  ? "Needs the Home Screen app."
                  : "Deals and money, live."
          }
          value={<Chip tone={status[push.status].tone}>{status[push.status].chip}</Chip>}
        />
        {install.offerable && (
          <StatRow
            lead={<AppIcon size={40} />}
            label="Install the app"
            sub="Opens from your home screen."
            onClick={() => (install.ios ? setGuideFor("ios") : void install.prompt())}
          />
        )}
      </RowGroup>

      <div className="mt-3 flex gap-2">
        {push.status === "on" ? (
          <>
            <Button variant="secondary" full busy={testing} onClick={() => void test()}>
              Send me a test
            </Button>
            <Button variant="quiet" full busy={push.busy} onClick={() => void push.disable()}>
              Turn off
            </Button>
          </>
        ) : push.status === "off" ? (
          <Button full busy={push.busy} onClick={() => void push.enable()}>
            Turn on notifications
          </Button>
        ) : push.status === "denied" ? (
          <Button variant="secondary" full onClick={() => setGuideFor("blocked")}>
            How to allow them
          </Button>
        ) : push.status === "needs-install" ? (
          <Button variant="secondary" full onClick={() => setGuideFor("ios")}>
            Show me how
          </Button>
        ) : null}
      </div>
      {(tested || push.error) && (
        <div className="mt-3">
          <Note tone={push.error ? "bad" : "info"}>{push.error ?? tested}</Note>
        </div>
      )}
      <GuideSheet guide={guideFor} onClose={() => setGuideFor(null)} installed={install.installed} />
    </section>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { BellOff, BellRing, Laptop, Smartphone, Trash2 } from "lucide-react";
import {
  hasDomain,
  isScopedRole,
  type AuthUser,
  type PushDevicesResponse,
  type PushOutcome,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { relative } from "@/lib/admin/format";
import { useInstall } from "@/lib/install";
import { useAppBadge, useNotificationRouting, usePush } from "@/lib/push";
import { BottomSheet } from "./BottomSheet";
import { Badge, Button, Card, CardHead, ErrorNote, IconButton, Skeleton, type Tone } from "./ui";

/**
 * The console on the team's phones and laptops: notifications on, and the
 * console installed as its own app. A sheet on the first visit, a row on Alerts
 * while it is still off, and a card on the profile to manage it.
 */

const ASKED_KEY = "avhomes.welcome.admin";
const ASK_AGAIN_MS = 14 * 24 * 60 * 60 * 1000;

/** What this role will actually hear about, so the ask is concrete. Empty means push has nothing for them. */
export function consoleHears(user: AuthUser): string[] {
  if (isScopedRole(user.role)) return [];
  const out: string[] = [];
  if (hasDomain(user.role, "danger")) out.push("new mail");
  if (hasDomain(user.role, "enquiries")) out.push("enquiries");
  if (hasDomain(user.role, "marketing")) out.push("deals from partners");
  if (hasDomain(user.role, "team")) out.push("partner applications");
  if (hasDomain(user.role, "danger")) out.push("emails that fail to send");
  if (user.role === "developer") out.push("requests for you");
  return out;
}

function sentence(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function AppIcon({ size }: { size: number }) {
  return (
    <Image
      src="/pwa/admin-192.png"
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[22%] shadow-[0_2px_8px_rgb(28_18_20/0.25)]"
    />
  );
}

type Guide = "ios" | "blocked" | null;

function GuideSheet({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  return (
    <BottomSheet
      open={guide !== null}
      onOpenChange={(open) => !open && onClose()}
      title={guide === "ios" ? "Add the console to your Home Screen" : "Allow notifications"}
      description={
        guide === "ios"
          ? "iPhone only sends notifications to apps on the Home Screen."
          : "This browser has blocked notifications from AV Homes."
      }
      footer={
        <Button variant="ghost" className="w-full" onClick={onClose}>
          Got it
        </Button>
      }
    >
      {guide === "ios" ? (
        <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-slate-700">
          <li>
            Tap <b>Share</b>. In Safari it is at the bottom of the screen.
          </li>
          <li>
            Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.
          </li>
          <li>
            Open <b>AV Console</b> from your Home Screen and turn notifications on there.
          </li>
        </ol>
      ) : (
        <div className="space-y-2 text-[13px] leading-relaxed text-slate-700">
          <p>
            Click the icon to the left of the web address, open <b>Site settings</b> or <b>Permissions</b>, and set{" "}
            <b>Notifications</b> to <b>Allow</b>.
          </p>
          <p>Come back to this tab afterwards and they switch on by themselves.</p>
        </div>
      )}
    </BottomSheet>
  );
}

export interface ConsoleAsk {
  id: "notifications" | "install";
  title: string;
  body: string;
  action: string;
  run: () => void;
  busy: boolean;
}

export function useConsoleAsks(user: AuthUser): { asks: ConsoleAsk[]; guide: ReactNode; error: string | null } {
  const push = usePush("admin");
  const install = useInstall();
  const [guide, setGuide] = useState<Guide>(null);
  const hears = consoleHears(user);
  const asks: ConsoleAsk[] = [];

  if (hears.length > 0) {
    const what = `Hear about ${sentence(hears)} the moment they land.`;
    if (push.status === "needs-install") {
      asks.push({
        id: "notifications",
        title: "Get notifications on iPhone",
        body: `Add the console to your Home Screen, then turn them on there. ${what}`,
        action: "Show me how",
        run: () => setGuide("ios"),
        busy: false,
      });
    } else if (push.status === "off") {
      asks.push({
        id: "notifications",
        title: "Turn on notifications on this device",
        body: what,
        action: "Turn on",
        run: () => void push.enable(),
        busy: push.busy,
      });
    } else if (push.status === "denied") {
      asks.push({
        id: "notifications",
        title: "Notifications are blocked on this device",
        body: `Allow them in the browser's settings. ${what}`,
        action: "How to allow",
        run: () => setGuide("blocked"),
        busy: false,
      });
    }
  }

  if (install.offerable && push.status !== "needs-install") {
    asks.push({
      id: "install",
      title: "Install the console",
      body: "Opens in its own window from your home screen or dock, with its own icon.",
      action: install.ios ? "Show me how" : "Install",
      run: () => (install.ios ? setGuide("ios") : void install.prompt()),
      busy: false,
    });
  }

  return { asks, error: push.error, guide: <GuideSheet guide={guide} onClose={() => setGuide(null)} /> };
}

/** Mounted once by the shell: keeps this device's subscription current, routes taps, keeps the icon's number. */
export function ConsolePushKeeper({ badge }: { badge: number }) {
  usePush("admin");
  useNotificationRouting();
  useAppBadge(badge);
  return null;
}

function AskIcon({ id }: { id: ConsoleAsk["id"] }) {
  return id === "install" ? (
    <AppIcon size={36} />
  ) : (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-wine-50 text-wine-700">
      <BellRing className="h-[18px] w-[18px]" aria-hidden />
    </span>
  );
}

function AskRows({ asks }: { asks: ConsoleAsk[] }) {
  return (
    <ul className="divide-y divide-mist-100">
      {asks.map((ask) => (
        <li key={ask.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <AskIcon id={ask.id} />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-plum-950">{ask.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">{ask.body}</p>
            </div>
          </div>
          <Button
            variant={ask.id === "notifications" ? "primary" : "ghost"}
            disabled={ask.busy}
            onClick={ask.run}
            className="w-full sm:w-auto"
          >
            {ask.busy ? "Turning on" : ask.action}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/** The first console visit: both asks in one sheet, once, and again a fortnight later if still off. */
export function ConsoleWelcome({ user }: { user: AuthUser }) {
  const { asks, guide, error } = useConsoleAsks(user);
  const [open, setOpen] = useState(false);
  const pending = asks.length > 0;

  useEffect(() => {
    if (!pending) return;
    let asked = 0;
    try {
      asked = Number(localStorage.getItem(ASKED_KEY) ?? "0") || 0;
    } catch {
      return;
    }
    if (Date.now() - asked < ASK_AGAIN_MS) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(ASKED_KEY, String(Date.now()));
      } catch {
        // Asks again next visit.
      }
      setOpen(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [pending]);

  // Closes itself once everything in it is done.
  const shouldClose = open && !pending;
  if (shouldClose) setOpen(false);

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Stay on top of the console"
        description={
          asks.length > 1
            ? "Two quick things so nothing waits for you to open a tab."
            : "So nothing waits for you to open a tab."
        }
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
              Not now
            </Button>
            <p className="text-center text-[12px] text-slate-550">You can change this any time on your profile.</p>
          </div>
        }
      >
        <AskRows asks={asks} />
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{error}</p>}
      </BottomSheet>
      {guide}
    </>
  );
}

/** At the top of Alerts while this device still needs something. Nothing once it is set up. */
export function ConsoleDeviceAlert({ user }: { user: AuthUser }) {
  const { asks, guide, error } = useConsoleAsks(user);
  if (asks.length === 0) return <>{guide}</>;
  return (
    <section aria-labelledby="this-device" className="mb-8">
      <h2 id="this-device" className="text-[15px] font-semibold text-plum-950">
        This device
      </h2>
      <p className="mt-1 max-w-prose text-[13px] text-slate-600">
        Nothing on the site is wrong here. This is about how the console reaches you.
      </p>
      <div className="mt-4 rounded-2xl bg-white p-5 shadow-card sm:p-6">
        <AskRows asks={asks} />
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-800">{error}</p>}
      </div>
      {guide}
    </section>
  );
}

const OUTCOME: Record<PushOutcome, { label: string; tone: Tone }> = {
  delivered: { label: "Delivered", tone: "green" },
  partial: { label: "Some devices", tone: "amber" },
  failed: { label: "Failed", tone: "red" },
  "no-device": { label: "Nowhere to send", tone: "neutral" },
};

/** Profile: this device's switch, every device that has it on, and what was sent lately. */
export function ConsoleNotificationsCard({ user }: { user: AuthUser }) {
  const push = usePush("admin");
  const install = useInstall();
  const [guideFor, setGuideFor] = useState<Guide>(null);
  const [note, setNote] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const list = useAsync((signal) => api.get<PushDevicesResponse>("/push/devices", signal), [push.status]);
  const hears = consoleHears(user);

  async function test() {
    setTesting(true);
    setNote(null);
    try {
      const result = await push.test();
      setNote(
        result?.outcome === "delivered" || result?.outcome === "partial"
          ? "Sent. It should appear in a few seconds."
          : "It did not go through. Turn notifications off and on again on this device.",
      );
      list.reload();
    } catch {
      setNote("The test could not be sent. Check your connection and try again.");
    } finally {
      setTesting(false);
    }
  }

  async function remove(id: string) {
    await api.del(`/push/devices/${encodeURIComponent(id)}`).catch(() => null);
    list.reload();
  }

  const state: Record<typeof push.status, { label: string; tone: Tone }> = {
    checking: { label: "Checking", tone: "neutral" },
    on: { label: "On", tone: "green" },
    off: { label: "Off", tone: "neutral" },
    denied: { label: "Blocked", tone: "red" },
    "needs-install": { label: "Needs the Home Screen app", tone: "amber" },
    unsupported: { label: "Not in this browser", tone: "neutral" },
  };

  const consoleDevices = (list.data?.devices ?? []).filter((device) => device.app === "admin");

  return (
    <section id="notifications" className="scroll-mt-24">
      <Card className="space-y-4">
        <CardHead title="Notifications" icon={BellRing} action={<Badge tone={state[push.status].tone}>{state[push.status].label}</Badge>} />
        <p className="-mt-2 text-[12.5px] leading-relaxed text-slate-600">
          {hears.length > 0
            ? `On this device you hear about ${sentence(hears)} as they happen.`
            : "Your role has nothing that sends notifications yet."}
        </p>

        {hears.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {push.status === "on" && (
              <>
                <Button variant="ghost" disabled={testing} onClick={() => void test()}>
                  {testing ? "Sending" : "Send a test"}
                </Button>
                <Button variant="ghost" disabled={push.busy} onClick={() => void push.disable()}>
                  <BellOff className="h-4 w-4" aria-hidden />
                  Turn off here
                </Button>
              </>
            )}
            {push.status === "off" && (
              <Button disabled={push.busy} onClick={() => void push.enable()}>
                {push.busy ? "Turning on" : "Turn on for this device"}
              </Button>
            )}
            {push.status === "denied" && (
              <Button variant="ghost" onClick={() => setGuideFor("blocked")}>
                How to allow them
              </Button>
            )}
            {push.status === "needs-install" && (
              <Button variant="ghost" onClick={() => setGuideFor("ios")}>
                Show me how
              </Button>
            )}
            {install.offerable && (
              <Button variant="ghost" onClick={() => (install.ios ? setGuideFor("ios") : void install.prompt())}>
                <AppIcon size={16} />
                Install the console
              </Button>
            )}
          </div>
        )}
        {(note || push.error) && (
          <p role="status" className="rounded-lg bg-mist-50 px-3 py-2 text-[12.5px] text-slate-700">
            {push.error ?? note}
          </p>
        )}

        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-550">Devices with it on</h3>
          {list.error && <ErrorNote error={list.error} onRetry={list.reload} />}
          {!list.data && !list.error && <Skeleton className="mt-2 h-10 rounded-lg" />}
          {list.data && consoleDevices.length === 0 && (
            <p className="mt-2 text-[12.5px] text-slate-600">None yet. Notifications reach a device once it is turned on there.</p>
          )}
          {consoleDevices.length > 0 && (
            <ul className="mt-2 divide-y divide-mist-100">
              {consoleDevices.map((device) => (
                <li key={device.id} className="flex items-center gap-3 py-2">
                  {/Android|iPhone|iPad/u.test(device.label) ? (
                    <Smartphone className="h-4 w-4 shrink-0 text-slate-550" aria-hidden />
                  ) : (
                    <Laptop className="h-4 w-4 shrink-0 text-slate-550" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-plum-950">{device.label}</p>
                    <p className="text-[12px] text-slate-600">
                      {device.lastOkAt ? `Last reached ${relative(device.lastOkAt)}` : `Added ${relative(device.createdAt)}`}
                    </p>
                  </div>
                  <IconButton label={`Stop notifications on ${device.label}`} icon={Trash2} onClick={() => void remove(device.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {list.data && list.data.recent.length > 0 && (
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-550">Sent to you lately</h3>
            <ul className="mt-2 divide-y divide-mist-100">
              {list.data.recent.slice(0, 8).map((row) => (
                <li key={row.id} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-plum-950">{row.title}</p>
                    <p className="text-[12px] text-slate-600">
                      {relative(row.createdAt)}
                      {row.openedAt ? " · opened" : ""}
                    </p>
                  </div>
                  <Badge tone={OUTCOME[row.outcome].tone}>{OUTCOME[row.outcome].label}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
      <GuideSheet guide={guideFor} onClose={() => setGuideFor(null)} />
    </section>
  );
}

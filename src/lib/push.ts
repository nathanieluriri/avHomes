"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { PUSH_SCOPE, type PushApp, type PushLogView } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";

/**
 * Push notifications in the browser: whether this device can have them, turning
 * them on and off, and keeping the server's copy of the subscription current.
 *
 * One store per app, so the welcome sheet, the alert card and the profile
 * switch on the same screen always agree without passing anything around.
 *
 * iPhone is the special case. Safari only offers push to an app added to the
 * Home Screen, so in a Safari tab the answer is `needs-install`, not "no".
 */

export type PushStatus = "checking" | "unsupported" | "needs-install" | "denied" | "off" | "on";

interface Ready {
  registration: ServiceWorkerRegistration;
  publicKey: string;
}

interface Store {
  status: PushStatus;
  busy: boolean;
  error: string | null;
  ready: Promise<Ready | null> | null;
  started: boolean;
  listeners: Set<() => void>;
}

const stores: Record<PushApp, Store> = {
  m: { status: "checking", busy: false, error: null, ready: null, started: false, listeners: new Set() },
  admin: { status: "checking", busy: false, error: null, ready: null, started: false, listeners: new Set() },
};

function set(app: PushApp, patch: Partial<Pick<Store, "status" | "busy" | "error">>): void {
  Object.assign(stores[app], patch);
  // A new object each change, so useSyncExternalStore sees one.
  snapshots[app] = { status: stores[app].status, busy: stores[app].busy, error: stores[app].error };
  for (const listener of stores[app].listeners) listener();
}

const snapshots: Record<PushApp, { status: PushStatus; busy: boolean; error: string | null }> = {
  m: { status: "checking", busy: false, error: null },
  admin: { status: "checking", busy: false, error: null },
};
const SERVER_SNAPSHOT = { status: "checking" as PushStatus, busy: false, error: null };

/* ─────────────────────────────── the device ─────────────────────────────── */

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/u.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Opened from the home screen, not a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function support(): "supported" | "needs-install" | "unsupported" {
  if (isIos() && !isStandalone()) return "needs-install";
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) return "supported";
  return "unsupported";
}

/* Turned off on purpose on this device, so a granted permission does not switch it straight back on. */
const MUTED = (app: PushApp) => `avhomes.push.off.${app}`;

function muted(app: PushApp): boolean {
  try {
    return localStorage.getItem(MUTED(app)) === "1";
  } catch {
    return false;
  }
}

function setMuted(app: PushApp, value: boolean): void {
  try {
    if (value) localStorage.setItem(MUTED(app), "1");
    else localStorage.removeItem(MUTED(app));
  } catch {
    // Private mode: the choice lasts as long as the page does.
  }
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/gu, "+").replace(/_/gu, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const a = new Uint8Array(current);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

async function activeRegistration(app: PushApp): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: PUSH_SCOPE[app] });
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  if (worker) {
    await new Promise<void>((resolve) => {
      const done = () => {
        if (worker.state === "activated") {
          worker.removeEventListener("statechange", done);
          resolve();
        }
      };
      worker.addEventListener("statechange", done);
      done();
    });
  }
  return registration;
}

/** The worker and the key, fetched ahead of the tap, so the tap goes straight to the browser's own prompt. */
function prepare(app: PushApp): Promise<Ready | null> {
  stores[app].ready ??= Promise.all([activeRegistration(app), api.get<{ publicKey: string }>("/push/key")])
    .then(([registration, key]) => ({ registration, publicKey: key.publicKey }))
    .catch(() => {
      stores[app].ready = null;
      return null;
    });
  return stores[app].ready;
}

async function save(app: PushApp, subscription: PushSubscription): Promise<void> {
  await api.post("/push/devices", { app, subscription: subscription.toJSON() });
}

/**
 * Works out where this device stands, and quietly renews a subscription the
 * server should know about: one made against an older key, or one another
 * person's sign-in left attached to them.
 */
async function refresh(app: PushApp): Promise<void> {
  const can = support();
  if (can !== "supported") {
    set(app, { status: can });
    return;
  }
  if (Notification.permission === "denied") {
    set(app, { status: "denied" });
    return;
  }
  if (Notification.permission !== "granted" || muted(app)) {
    set(app, { status: "off" });
    return;
  }
  const ready = await prepare(app);
  if (!ready) {
    set(app, { status: "off" });
    return;
  }
  try {
    let subscription = await ready.registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription, ready.publicKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await ready.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(ready.publicKey),
    });
    await save(app, subscription);
    set(app, { status: "on" });
  } catch {
    set(app, { status: "off" });
  }
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.name === "NotAllowedError") return "Notifications were blocked for this site.";
  return "Notifications could not be turned on. Try again in a moment.";
}

/** Must run from a tap: the browser only shows its permission prompt for one. */
export async function enablePush(app: PushApp): Promise<boolean> {
  set(app, { busy: true, error: null });
  try {
    const ready = await prepare(app);
    if (!ready) throw new Error("not ready");
    // subscribe() asks for permission itself, and it is the first await after the tap, which iPhone requires.
    const subscription = await ready.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(ready.publicKey),
    });
    setMuted(app, false);
    await save(app, subscription);
    set(app, { status: "on", busy: false });
    return true;
  } catch (err) {
    const denied = typeof Notification !== "undefined" && Notification.permission === "denied";
    set(app, { status: denied ? "denied" : "off", busy: false, error: denied ? null : describe(err) });
    return false;
  }
}

export async function disablePush(app: PushApp): Promise<void> {
  set(app, { busy: true, error: null });
  setMuted(app, true);
  await forgetThisDevice(app);
  set(app, { status: "off", busy: false });
}

/**
 * Drops this browser's subscription, here and on the server. Called before
 * signing out, so the next person to use the phone does not get the last
 * person's notifications.
 */
export async function forgetThisDevice(app: PushApp): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration(PUSH_SCOPE[app]);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await api.post("/push/devices/forget", { endpoint: subscription.endpoint }).catch(() => {});
    await subscription.unsubscribe().catch(() => false);
  } catch {
    // Signing out must never wait on this.
  }
}

export async function sendTestPush(app: PushApp): Promise<PushLogView | null> {
  const res = await api.post<{ result: PushLogView | null }>("/push/test", { app });
  return res.result;
}

function start(app: PushApp): void {
  const store = stores[app];
  if (store.started) return;
  store.started = true;
  if (support() === "supported") void prepare(app);
  void refresh(app);
  // Coming back to the app after changing the permission in the browser's settings.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh(app);
  });
}

/**
 * This device's notifications for one app. The first screen to use it starts
 * the check; every other screen shares the answer.
 */
export function usePush(app: PushApp) {
  const state = useSyncExternalStore(
    (listener) => {
      stores[app].listeners.add(listener);
      return () => stores[app].listeners.delete(listener);
    },
    () => snapshots[app],
    () => SERVER_SNAPSHOT,
  );
  useEffect(() => start(app), [app]);
  return {
    ...state,
    enable: () => enablePush(app),
    disable: () => disablePush(app),
    test: () => sendTestPush(app),
  };
}

/**
 * A tap on a notification for a window the worker cannot navigate arrives here,
 * and the app routes itself. Mounted once per shell.
 */
export function useNotificationRouting(): void {
  const router = useRouter();
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (data?.type !== "avhomes:open" || !data.url) return;
      const url = new URL(data.url, window.location.origin);
      if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
}

/** The number on the home screen icon, kept to what the app itself counts. */
export function useAppBadge(count: number | undefined): void {
  useEffect(() => {
    if (count === undefined || typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) void nav.setAppBadge?.(count).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  }, [count]);
}

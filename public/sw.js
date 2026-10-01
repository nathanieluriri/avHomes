/*
 * The service worker for both installable apps: the partner app, registered at
 * scope /m, and the console, at /admin. One file, two registrations, so each
 * app's notifications open in that app and carry its own icon.
 *
 * It does push and nothing else. There is no fetch handler on purpose: every
 * screen reads live money and mail, and a cached copy of either is wrong in a
 * way nobody can see.
 */

function appOf(registration) {
  return new URL(registration.scope).pathname.startsWith("/admin") ? "admin" : "m";
}

function scopePath(registration) {
  return new URL(registration.scope).pathname.replace(/\/$/, "") || "/";
}

function keyBytes(base64) {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function post(path, body) {
  return fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const app = appOf(self.registration);
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || (app === "admin" ? "AV Homes Console" : "AV Homes Partners");
  const options = {
    body: data.body || "",
    icon: `/pwa/${app}-192.png`,
    badge: "/pwa/badge-96.png",
    // A tag replaces the earlier one with the same news rather than stacking; renotify still buzzes.
    tag: data.tag || data.id || undefined,
    renotify: Boolean(data.tag),
    timestamp: Date.now(),
    data: { url: data.url || scopePath(self.registration), id: data.id || "" },
  };

  const shown = self.registration.showNotification(title, options);
  // The dot on the home screen icon. The app replaces it with the real count once it is opened.
  const badged =
    "setAppBadge" in self.navigator
      ? (typeof data.badge === "number" ? self.navigator.setAppBadge(data.badge) : self.navigator.setAppBadge()).catch(
          () => {},
        )
      : Promise.resolve();
  event.waitUntil(Promise.all([shown, badged]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || scopePath(self.registration), self.location.origin).href;

  event.waitUntil(
    (async () => {
      if (data.id) await post("/api/push/opened", { id: data.id }).catch(() => {});

      const scope = self.registration.scope;
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => client.url.startsWith(scope));
      if (open) {
        await open.focus();
        try {
          await open.navigate(target);
        } catch {
          // An uncontrolled window cannot be navigated from here; the shell listens and routes itself.
          open.postMessage({ type: "avhomes:open", url: target });
        }
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/* The browser rotated the subscription. Make a new one and swap it in, so nothing is missed. */
self.addEventListener("pushsubscriptionchange", (event) => {
  const app = appOf(self.registration);
  event.waitUntil(
    (async () => {
      const res = await fetch("/api/push/key", { credentials: "same-origin" });
      if (!res.ok) return;
      const { publicKey } = await res.json();
      const next = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      });
      await post("/api/push/devices", { app, subscription: next.toJSON() });
      if (event.oldSubscription) await post("/api/push/devices/forget", { endpoint: event.oldSubscription.endpoint });
    })().catch(() => {}),
  );
});

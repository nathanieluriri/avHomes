/**
 * Inlined by the /m and /admin layouts, which are server components and so
 * cannot import it from the "use client" module that reads it. It runs before
 * anything else on the page: Chrome fires `beforeinstallprompt` once, early, and
 * often before React has hydrated, so the event is held on `window` until
 * somebody taps Install. See `useInstall`.
 */
export const INSTALL_CAPTURE = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__avInstall=e;window.dispatchEvent(new Event("avhomes:installable"))});window.addEventListener("appinstalled",function(){window.__avInstall=null;window.dispatchEvent(new Event("avhomes:installable"))});`;

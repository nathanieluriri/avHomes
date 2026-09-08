"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
  Eye,
  Plus,
  RotateCw,
  Settings2,
  Star,
  Trash2,
} from "lucide-react";
import {
  hasDomain,
  isAdminRole,
  type AuthUser,
  type Page,
  type Property,
  type SiteStat,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useIsPhone } from "@/lib/admin/hooks";
import { Badge, Button, ErrorNote, Skeleton } from "./ui";

/**
 * The storefront, as it looks right now, with the parts of it that can be
 * changed from here.
 *
 * The preview is a real frame of the real homepage rather than a screenshot,
 * because a screenshot is a claim about the past that nothing keeps true. It is
 * `inert`, so it cannot take focus or a click and become a second, confusing
 * copy of the site inside the console.
 *
 * "Customize" edits only what the site genuinely reads from the database today:
 * the number strip under the homepage's reasons section, and the featured
 * listings that fill its grid. The hero's copy lives in
 * `src/components/Hero.tsx` and is not editable, so this panel does not pretend
 * it is.
 *
 * BELOW `sm` THE FRAME IS NOT MOUNTED, and that is a mount decision rather than
 * a visibility one on purpose: `hidden` still boots a second Next app, its
 * fonts, its hero imagery and its client JavaScript, over cellular, to draw a
 * 534px picture nobody can touch. The rest of this card, the domain, the status
 * and the two actions, is exactly as useful on a phone as on a desk, so the
 * card stays and only the picture becomes opt in. `useIsPhone` reads `false`
 * from the server snapshot, so the phone branch is what hydrates and the
 * download never starts on the way to being torn down.
 */

/*
 * Two frames, because scaling a 1280px page into a 340px card is not a preview,
 * it is a smudge. On a phone the card renders the storefront at a PHONE
 * viewport, which is both legible at that scale and the thing a phone visitor
 * would actually be looking at.
 */
const DESKTOP = { w: 1280, h: 820 };
const MOBILE = { w: 430, h: 700 };

export function StorefrontCard({ user }: { user: AuthUser }) {
  /*
   * The panel reads `/admin/stats`, which the server maps to the `listings`
   * domain. A `support` account holds `enquiries` and `analytics`, so it can
   * open this dashboard but not that endpoint, and offering it the button meant
   * offering a panel that could only ever answer 403 with a Try again that
   * could never succeed. The preview itself is just the public site, so it
   * stays for everyone.
   */
  const mayCustomize = hasDomain(user.role, "listings");
  const [customizing, setCustomizing] = useState(false);
  /* Bumped after a save so the frame re-fetches and the operator sees the edit
     land on the page, rather than being told it did. */
  const [previewNonce, setPreviewNonce] = useState(0);

  /* Asked for by a phone, never withheld from one. The state only ever turns
     the frame ON, so a desktop is unaffected and a phone that wants the picture
     gets it for the rest of the visit. */
  const isPhone = useIsPhone();
  const [askedForPreview, setAskedForPreview] = useState(false);
  const showPreview = !isPhone || askedForPreview;

  /*
   * The storefront is wherever this console is. Nothing is configured any more,
   * so the card reads the host out of the browser's own location rather than an
   * environment variable that used to say "storefront not configured" on every
   * deployment where somebody had not set it.
   *
   * The badge still reports what is actually known rather than always saying
   * Live: an https origin means a real deployment, and a green "Live" chip over
   * localhost is a status light wired to nothing.
   */
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const published = /^https:\/\//.test(origin);
  const domain = origin.replace(/^https?:\/\//, "") || "this deployment";

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-card">
      {/*
        The domain pill takes its own row on a phone. It was `flex-1 min-w-0`
        between two `shrink-0` action groups, so at 375px it collapsed to six
        pixels and the one element that identifies this card as the storefront
        disappeared. Wrapping is what the header already had; it just never got
        to use it.
      */}
      <header className="flex flex-wrap items-center gap-2 border-b border-mist-200 px-3 py-2.5">
        <span className="hidden shrink-0 gap-1.5 px-1 sm:flex" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-mist-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-mist-200" />
          <span className="h-2.5 w-2.5 rounded-full bg-mist-200" />
        </span>

        <p className="order-first flex h-7 w-full min-w-0 items-center gap-2 rounded-full bg-mist-100 px-3 text-[12px] text-slate-600 sm:order-none sm:w-auto sm:flex-1">
          <span className="truncate">{domain}</span>
          {published ? (
            <Badge tone="green">Live</Badge>
          ) : (
            <Badge tone="neutral">Local</Badge>
          )}
        </p>

        {/*
          These two keep their 28px drawn size at every width and take a 44px
          hit area from `.c-tap` instead, which is exactly what that utility is
          for: growing them would break the address bar this header is drawn as,
          and the bar is what says storefront before any copy does. `gap-2`
          rather than `gap-1.5` because the two hit areas bleed outside their
          buttons, and at 6px apart they steal each other's edges.
        */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {mayCustomize && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCustomizing((was) => !was)}
              title="Change what the homepage shows"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              Customize
            </Button>
          )}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="c-tap c-bevel inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[12px] font-semibold text-plum-950 transition-colors hover:bg-mist-50"
          >
            Open
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </header>

      {showPreview ? (
        <Preview nonce={previewNonce} />
      ) : (
        /* The offer, not the picture. The header above already draws the
           divider, so this row carries no border of its own. */
        <button
          type="button"
          onClick={() => setAskedForPreview(true)}
          className="flex h-11 w-full items-center justify-center gap-1.5 text-[13px] font-semibold text-wine-600 transition-colors hover:bg-mist-50 active:bg-mist-100"
        >
          <Eye className="h-4 w-4" aria-hidden="true" />
          Show the page preview
        </button>
      )}

      {mayCustomize && customizing && (
        <CustomizePanel
          user={user}
          previewShowing={showPreview}
          onSaved={() => setPreviewNonce((n) => n + 1)}
          onClose={() => setCustomizing(false)}
        />
      )}
    </section>
  );
}

/**
 * The homepage in a frame, scaled to whatever width the card has.
 *
 * The box's height is CSS, from an aspect ratio that matches the frame's own,
 * so the layout is correct before any measurement happens. Only the scale
 * factor needs JavaScript, and it is observed rather than computed once,
 * because the card's width changes when the rail collapses.
 */
function Preview({ nonce }: { nonce: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [frame, setFrame] = useState(DESKTOP);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width === 0) return;
      // The card's own width picks the frame, not the window's: the rail
      // collapsing changes this box without changing the viewport.
      const next = width < 480 ? MOBILE : DESKTOP;
      setFrame(next);
      setScale(width / next.w);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={boxRef}
      className="relative w-full overflow-hidden bg-mist-50"
      style={{ aspectRatio: `${frame.w} / ${frame.h}` }}
    >
      {/* `inert` rather than aria-hidden plus tabindex: the frame holds real
          links, and aria-hidden over focusable content is a violation on its
          own, where inert removes it from focus AND from the accessibility
          tree. `pointer-events-none` is the other half, because inert does not
          stop a wheel event, and without it a scroll over the card scrolls the
          embedded site instead of the dashboard. */}
      <div inert className="pointer-events-none absolute inset-0">
        <iframe
          key={nonce}
          src="/"
          title="Storefront preview"
          loading="lazy"
          scrolling="no"
          className="border-0"
          style={{
            width: frame.w,
            height: frame.h,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            // Hidden until measured, so the first paint is not a full size page
            // spilling out of a small card.
            visibility: scale === 0 ? "hidden" : "visible",
          }}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ CUSTOMIZE ══ */

/** One place that widens an unknown throw into the envelope ErrorNote reads. */
function asApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

interface Draft {
  value: string;
  label: string;
  suffix: string;
}

function CustomizePanel({
  user,
  previewShowing,
  onSaved,
  onClose,
}: {
  user: AuthUser;
  /** Whether the frame is mounted, so the save note only claims what happened. */
  previewShowing: boolean;
  onSaved: () => void;
  onClose: () => void;
}) {
  /*
   * Writing site stats is `requireAdmin()` on the server, so a role that cannot
   * save is shown the values and not the controls. Rendering a Save button that
   * the server would answer with a 403 teaches an operator that the console
   * lies about what they can do.
   */
  const mayEdit = isAdminRole(user.role);

  const stats = useAsync<{ items: SiteStat[] }>(
    (signal) => api.get<{ items: SiteStat[] }>("/admin/stats", signal),
    [],
  );
  const featured = useAsync<Page<Property>>(
    (signal) => api.get<Page<Property>>("/public/properties?featured=1&limit=6", signal),
    [],
  );

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * The panel brings itself into view when it opens. It is appended under a
   * preview that is most of the card's height, so on a 1440 by 900 screen it
   * arrived entirely below the fold and the button read as dead: the only
   * feedback was a card silently growing taller off screen.
   *
   * `nearest` is right on a desktop, where the panel is shorter than what is
   * left of the viewport and the minimum scroll puts all of it on screen. On a
   * phone the panel is taller than the viewport, so `nearest` lands its top
   * edge near the bottom of the screen and the visible result of tapping
   * Customize is the card twitching. There it scrolls to `start`.
   */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = !window.matchMedia("(min-width: 40rem)").matches;
    panelRef.current?.scrollIntoView({
      block: phone ? "start" : "nearest",
      behavior: reduced ? "auto" : "smooth",
    });
  }, []);

  const items = stats.data?.items ?? [];
  /* Six is what the homepage strip lays out. A cap the panel enforces beats a
     seventh row that exists in the database and nowhere on the site. */
  const full = items.length >= 6;

  function draftFor(stat: SiteStat): Draft {
    return (
      drafts[stat.id] ?? {
        value: String(stat.value),
        label: stat.label,
        suffix: stat.suffix ?? "",
      }
    );
  }

  function edit(stat: SiteStat, patch: Partial<Draft>) {
    setSaved(false);
    setDrafts((all) => ({ ...all, [stat.id]: { ...draftFor(stat), ...patch } }));
  }

  const dirty = items.filter((stat) => {
    const draft = drafts[stat.id];
    if (!draft) return false;
    return (
      draft.value !== String(stat.value) ||
      draft.label !== stat.label ||
      draft.suffix !== (stat.suffix ?? "")
    );
  });

  /*
   * The strip can start empty, and until now nothing in the console could add
   * to it, so "Customize" opened a panel with nothing in it to change. The
   * endpoint always supported creation: `PUT /admin/stats/new` upserts.
   */
  async function addStat() {
    setSaving(true);
    setError(null);
    try {
      await api.put("/admin/stats/new", {
        value: 0,
        label: "New counter",
        position: items.length,
      });
      stats.reload();
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeStat(id: string) {
    setSaving(true);
    setError(null);
    try {
      await api.del(`/admin/stats/${id}`);
      setDrafts((all) => {
        const next = { ...all };
        delete next[id];
        return next;
      });
      stats.reload();
      onSaved();
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // Sequential, not Promise.all: these are four writes to one small
      // collection and a partial failure should stop rather than leave the
      // operator guessing which of them landed.
      for (const stat of dirty) {
        const draft = draftFor(stat);
        await api.put(`/admin/stats/${stat.id}`, {
          value: Number(draft.value) || 0,
          label: draft.label,
          position: stat.position,
          ...(draft.suffix ? { suffix: draft.suffix } : {}),
          ...(stat.prefix ? { prefix: stat.prefix } : {}),
        });
      }
      setDrafts({});
      setSaved(true);
      stats.reload();
      onSaved();
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={panelRef}
      className="scroll-mt-2 border-t border-mist-200 bg-mist-50/70 p-4 sm:scroll-mt-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-plum-950">Homepage</h2>
        <p className="text-[12px] text-slate-600">What the site reads from the database.</p>
        {/* A real box below sm, pulled right by its own padding so it still
            lines up with the panel edge. Done is the only close control near
            the panel: the Customize toggle that also closes it is above a
            preview and off screen by the time this is read. */}
        <button
          type="button"
          onClick={onClose}
          className="-mr-2 ml-auto inline-flex h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-wine-600 hover:text-wine-700 sm:mr-0 sm:h-auto sm:px-0 sm:text-[12px]"
        >
          Done
        </button>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorNote error={error} />
        </div>
      )}

      {/*
        `min-w-0` on the grid AND on both sections, and it is the single fix
        that keeps this panel from breaking the console. A grid item's default
        `min-width: auto` refuses to shrink below its content's min-content
        width, so any wide child in here, a long counter label or the action
        row, widened its track instead of wrapping. That widened the card, and
        because the console is a `fixed inset-0` frame with an overflow-y
        scroller, a card wider than the frame means the whole console scrolls
        sideways with nothing to scroll it back.
      */}
      <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-2">
        <section className="min-w-0">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">
            The number strip
          </h3>
          <p className="mt-1 text-[12px] text-slate-600">
            The four counters in the reasons section.
          </p>

          {stats.loading && (
            /* The edit row is two lines below sm and one from sm up, so the
               placeholder is too. A skeleton drawn at the desktop height here
               would shuffle the whole panel on arrival. */
            <div className="mt-3 space-y-2">
              <Skeleton className="h-24 sm:h-9" />
              <Skeleton className="h-24 sm:h-9" />
            </div>
          )}
          {stats.error && (
            <div className="mt-3">
              <ErrorNote error={stats.error} onRetry={stats.reload} />
            </div>
          )}

          {stats.data && items.length === 0 && (
            <div className="mt-3 rounded-xl bg-white p-4 shadow-card">
              <p className="text-[13px] font-medium text-plum-950">No counters yet</p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
                The homepage renders that section without them. Add one here and it appears on
                the site as soon as you save.
              </p>
              {mayEdit && (
                <Button className="mt-3" onClick={addStat} disabled={saving}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Add a counter
                </Button>
              )}
            </div>
          )}

          {items.length > 0 && (
            <ul className="mt-3 space-y-2">
              {items.map((stat) => {
                const draft = draftFor(stat);
                if (!mayEdit) {
                  return (
                    <li
                      key={stat.id}
                      className="flex items-baseline gap-2 rounded-lg bg-white px-3 py-2 shadow-card"
                    >
                      <span className="c-num text-sm font-bold text-plum-950">
                        {stat.prefix}
                        {stat.value}
                        {stat.suffix}
                      </span>
                      <span className="truncate text-[13px] text-slate-600">{stat.label}</span>
                    </li>
                  );
                }
                return (
                  /*
                    Two rows below sm, one row from sm up. As a single flex line
                    the fixed pieces and gaps took 192px of the 296px a 360px
                    phone has here, leaving 104px for the label: the field most
                    likely to actually be edited was the one edited through a
                    peephole. The label gets a full row of its own instead.

                    `sm:contents` on the value/suffix pair is what keeps the
                    desktop row byte for byte what it was: below sm the pair is
                    one grid cell, from sm up the wrapper stops generating a box
                    and its two labels become flex children of the row directly,
                    in the same order they are written.
                  */
                  <li
                    key={stat.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:items-center"
                  >
                    <div className="col-start-1 row-start-1 flex items-center gap-2 sm:contents">
                      <label className="w-20 sm:shrink-0">
                        <span className="sr-only">Value for {stat.label}</span>
                        <input
                          inputMode="numeric"
                          value={draft.value}
                          onChange={(event) => edit(stat, { value: event.target.value })}
                          className="c-num h-11 w-full rounded-lg border border-mist-200 bg-white px-2 text-right text-[13px] font-semibold text-plum-950 outline-none focus:border-wine-500 sm:h-8"
                        />
                      </label>
                      <label className="w-14 sm:shrink-0">
                        <span className="sr-only">Suffix for {stat.label}</span>
                        <input
                          value={draft.suffix}
                          placeholder="+"
                          onChange={(event) => edit(stat, { suffix: event.target.value })}
                          className="h-11 w-full rounded-lg border border-mist-200 bg-white px-2 text-[13px] text-plum-950 outline-none placeholder:text-slate-550 focus:border-wine-500 sm:h-8"
                        />
                      </label>
                    </div>
                    <label className="col-span-2 row-start-2 min-w-0 sm:flex-1">
                      <span className="sr-only">Label for this counter</span>
                      <input
                        value={draft.label}
                        onChange={(event) => edit(stat, { label: event.target.value })}
                        className="h-11 w-full rounded-lg border border-mist-200 bg-white px-2 text-[13px] text-plum-950 outline-none focus:border-wine-500 sm:h-8"
                      />
                    </label>
                    <RemoveStat
                      label={stat.label}
                      disabled={saving}
                      onConfirm={() => void removeStat(stat.id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {mayEdit && items.length > 0 && (
            /* Wrapping, because `BUTTON_BASE` carries `shrink-0` and nothing in
               this row could compress: two buttons plus a status sentence came
               to roughly 380px inside a 296px panel. The two messages take a
               line of their own below sm rather than being squeezed beside the
               buttons. */
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={save} disabled={dirty.length === 0 || saving}>
                {saving ? (
                  <>
                    <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Saving
                  </>
                ) : (
                  `Save ${dirty.length === 0 ? "changes" : dirty.length === 1 ? "1 change" : `${dirty.length} changes`}`
                )}
              </Button>
              <Button variant="ghost" onClick={addStat} disabled={saving || full}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Add
              </Button>
              {full && (
                <span className="basis-full text-[12px] text-slate-600 sm:basis-auto">
                  Six is what the strip fits.
                </span>
              )}
              {saved && dirty.length === 0 && (
                /* The note only claims the reload when there is a frame to
                   reload. On a phone the preview is not mounted, and telling
                   somebody a picture they cannot see has refreshed is the same
                   class of lie as a Live badge over localhost. */
                <span className="flex basis-full items-center gap-1 text-[12px] font-medium text-emerald-700 sm:basis-auto">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {previewShowing ? "Saved, and the preview reloaded" : "Saved, and the site updated"}
                </span>
              )}
            </div>
          )}

          {!mayEdit && items.length > 0 && (
            <p className="mt-3 text-[12px] text-slate-600">
              Only an owner or a developer can change these.
            </p>
          )}
        </section>

        <section className="min-w-0">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">
            Featured listings
          </h3>
          <p className="mt-1 text-[12px] text-slate-600">
            The homepage shows up to six. A listing is added or removed from its own editor.
          </p>

          {featured.loading && (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-13 sm:h-11" />
              <Skeleton className="h-13 sm:h-11" />
            </div>
          )}

          {featured.data && featured.data.items.length === 0 && (
            <p className="mt-3 text-[13px] text-slate-600">
              None yet, so the homepage falls back to the most recent listings.
            </p>
          )}

          {featured.data && featured.data.items.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {featured.data.items.map((property) => (
                <li key={property.id}>
                  <Link
                    href={`/admin/properties/${property.id}`}
                    /* `py-2` below sm takes the row from exactly 44px to 52px.
                       Meeting the floor with zero margin is a row that fails
                       the moment the thumbnail changes size. */
                    className="flex items-center gap-2.5 rounded-lg bg-white px-2 py-2 shadow-card transition-colors hover:bg-wine-50/60 active:bg-wine-50 sm:py-1.5"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-mist-100 text-slate-550">
                      {property.images[0] ? (
                        <img src={property.images[0]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-plum-950">
                      {property.title || "Untitled listing"}
                    </span>
                    <Star
                      className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/admin/properties"
            className="-ml-2 mt-1 inline-flex h-11 items-center rounded-lg px-2 text-[13px] font-semibold text-wine-600 hover:text-wine-700 sm:ml-0 sm:mt-3 sm:h-auto sm:px-0 sm:text-[12px]"
          >
            Manage listings
          </Link>
        </section>
      </div>
    </div>
  );
}

/**
 * Remove a counter, asked twice, in place.
 *
 * The console's own two tap confirm shape, hand rolled rather than taken from
 * `ConfirmButton` for one reason: at rest this has to stay a glyph. It sits in
 * a dense edit row where a button reading "Remove" at every width would rewrite
 * what the desktop row is, and `ConfirmButton` has no way to give an icon-only
 * resting state an accessible name. Armed it becomes words, because the second
 * tap is the one that has to be readable and a red icon is not an outcome.
 *
 * It matters most on a phone. This is an irreversible write with no undo, it
 * used to be a 32px target eight pixels from a text field, and a thumb that
 * misses the field hits it.
 */
function RemoveStat({
  label,
  disabled,
  onConfirm,
}: {
  label: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      disabled={disabled}
      /* The armed state is announced as well as drawn, because a colour change
         is not available to a screen reader and this is the control where the
         reader has to know which of two things the next press does. */
      aria-live="polite"
      aria-label={armed ? undefined : `Remove the ${label} counter`}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onConfirm();
      }}
      className={`col-start-2 row-start-1 inline-flex h-11 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-40 sm:h-8 ${
        armed
          ? "c-bevel-danger bg-red-600 px-2.5 text-white hover:bg-red-700"
          : "w-11 text-slate-550 hover:bg-red-50 hover:text-red-700 sm:w-8"
      }`}
    >
      {armed ? "Yes, remove" : <Trash2 className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden="true" />}
    </button>
  );
}

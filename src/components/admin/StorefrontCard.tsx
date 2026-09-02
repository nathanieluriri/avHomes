"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Building2,
  Check,
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
import { useAsync } from "@/lib/admin/hooks";
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

  /*
   * The badge reports what is actually known rather than always saying Live.
   * A published origin means the storefront is reachable; without one this is a
   * developer's machine, and a green "Live" chip over localhost is a status
   * light wired to nothing.
   */
  const origin = (process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "").replace(/\/+$/, "");
  const published = /^https:\/\//.test(origin);
  const domain = origin.replace(/^https?:\/\//, "") || "storefront not configured";

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

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
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
            className="c-bevel inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[12px] font-semibold text-navy-950 transition-colors hover:bg-mist-50"
          >
            Open
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </header>

      <Preview nonce={previewNonce} />

      {mayCustomize && customizing && (
        <CustomizePanel
          user={user}
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
  onSaved,
  onClose,
}: {
  user: AuthUser;
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
   */
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panelRef.current?.scrollIntoView({
      block: "nearest",
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
    <div ref={panelRef} className="scroll-mt-4 border-t border-mist-200 bg-mist-50/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-navy-950">Homepage</h2>
        <p className="text-[12px] text-slate-600">What the site reads from the database.</p>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[12px] font-semibold text-blue-600 hover:text-blue-700"
        >
          Done
        </button>
      </div>

      {error && (
        <div className="mt-3">
          <ErrorNote error={error} />
        </div>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">
            The number strip
          </h3>
          <p className="mt-1 text-[12px] text-slate-600">
            The four counters in the reasons section.
          </p>

          {stats.loading && (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          )}
          {stats.error && (
            <div className="mt-3">
              <ErrorNote error={stats.error} onRetry={stats.reload} />
            </div>
          )}

          {stats.data && items.length === 0 && (
            <div className="mt-3 rounded-xl bg-white p-4 shadow-card">
              <p className="text-[13px] font-medium text-navy-950">No counters yet</p>
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
                      <span className="c-num text-sm font-bold text-navy-950">
                        {stat.prefix}
                        {stat.value}
                        {stat.suffix}
                      </span>
                      <span className="truncate text-[13px] text-slate-600">{stat.label}</span>
                    </li>
                  );
                }
                return (
                  <li key={stat.id} className="flex items-center gap-2">
                    <label className="w-20 shrink-0">
                      <span className="sr-only">Value for {stat.label}</span>
                      <input
                        inputMode="numeric"
                        value={draft.value}
                        onChange={(event) => edit(stat, { value: event.target.value })}
                        className="c-num h-8 w-full rounded-lg border border-mist-200 bg-white px-2 text-right text-[13px] font-semibold text-navy-950 outline-none focus:border-blue-500"
                      />
                    </label>
                    <label className="w-14 shrink-0">
                      <span className="sr-only">Suffix for {stat.label}</span>
                      <input
                        value={draft.suffix}
                        placeholder="+"
                        onChange={(event) => edit(stat, { suffix: event.target.value })}
                        className="h-8 w-full rounded-lg border border-mist-200 bg-white px-2 text-[13px] text-navy-950 outline-none placeholder:text-slate-550 focus:border-blue-500"
                      />
                    </label>
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Label for this counter</span>
                      <input
                        value={draft.label}
                        onChange={(event) => edit(stat, { label: event.target.value })}
                        className="h-8 w-full rounded-lg border border-mist-200 bg-white px-2 text-[13px] text-navy-950 outline-none focus:border-blue-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => void removeStat(stat.id)}
                      disabled={saving}
                      aria-label={`Remove the ${stat.label} counter`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-550 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {mayEdit && items.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
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
                <span className="text-[12px] text-slate-600">Six is what the strip fits.</span>
              )}
              {saved && dirty.length === 0 && (
                <span className="flex items-center gap-1 text-[12px] font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Saved, and the preview reloaded
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

        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-slate-600">
            Featured listings
          </h3>
          <p className="mt-1 text-[12px] text-slate-600">
            The homepage shows up to six. A listing is added or removed from its own editor.
          </p>

          {featured.loading && (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
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
                    className="flex items-center gap-2.5 rounded-lg bg-white px-2 py-1.5 shadow-card transition-colors hover:bg-blue-50/60"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-mist-100 text-slate-550">
                      {property.images[0] ? (
                        <img src={property.images[0]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-navy-950">
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
            className="mt-3 inline-block text-[12px] font-semibold text-blue-600 hover:text-blue-700"
          >
            Manage listings
          </Link>
        </section>
      </div>
    </div>
  );
}

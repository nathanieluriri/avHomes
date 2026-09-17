"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { Megaphone, Pin, Plus } from "lucide-react";
import {
  MARKETING_UPDATE_STATUSES,
  MARKETING_UPDATE_TONES,
  UPDATE_BODY_MAX,
  UPDATE_LINK_LABEL_MAX,
  UPDATE_LINK_MAX,
  UPDATE_TITLE_MAX,
  updateRefusal,
  type MarketingUpdate,
  type MarketingUpdateStatus,
  type MarketingUpdateTone,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { shortDate } from "@/lib/admin/format";
import { toApiError } from "@/lib/admin/marketing";
import ImagePicker from "@/components/admin/ImagePicker";
import { BottomSheet } from "@/components/admin/BottomSheet";
import {
  Badge,
  Button,
  ConfirmButton,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  Switch,
  inputClass,
  type Tone,
} from "@/components/admin/ui";
import { DataTable, IdCell, type Column } from "@/components/admin/DataTable";

/**
 * Updates: the cards at the top of every marketer's app.
 *
 * Only what somebody writes lives here. A new listing gets a card of its own for
 * three weeks without anybody touching this screen, so the list is for the news
 * a listing cannot say: a site visit day, a change to pay day, a thank you.
 *
 * A card is on phones when it is Live and today sits between its first and last
 * day. Both halves are shown on every row, because "Live" on a card that ended
 * last week is the one status that would send somebody looking for a bug.
 */

interface UpdateList {
  items: MarketingUpdate[];
}

/** Held as typed. The dates are `<input type="date">` values in the reader's own zone. */
interface Draft {
  title: string;
  body: string;
  imageUrl: string;
  linkLabel: string;
  linkHref: string;
  tone: MarketingUpdateTone;
  pinned: boolean;
  status: MarketingUpdateStatus;
  /** Empty means from the moment it is saved. */
  firstDay: string;
  /** The last day it is on screen, inclusive. Empty means until it is taken down. */
  lastDay: string;
}

const TONE: Record<MarketingUpdateTone, { label: string; swatch: string }> = {
  wine: { label: "Wine", swatch: "bg-wine-600" },
  gold: { label: "Gold", swatch: "bg-amber-400" },
  plum: { label: "Plum", swatch: "bg-plum-950" },
};

const STATUS: Record<MarketingUpdateStatus, { label: string; blurb: string }> = {
  draft: {
    label: "Draft",
    blurb: "Only the console sees it. Nothing reaches a phone.",
  },
  live: {
    label: "Live",
    blurb: "On every marketer's home screen from the first day to the last.",
  },
};

type Phase = "draft" | "scheduled" | "live" | "ended";

const PHASE: Record<Phase, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Starts later", tone: "amber" },
  live: { label: "Live", tone: "green" },
  ended: { label: "Ended", tone: "neutral" },
};

/** What a marketer sees right now, which is the status and the dates read together. */
function phaseOf(update: MarketingUpdate, now: number): Phase {
  if (update.status === "draft") return "draft";
  if (update.startsAt > now) return "scheduled";
  if (update.endsAt !== null && update.endsAt <= now) return "ended";
  return "live";
}

/** `endsAt` is stored exclusive, so the last day shown is the millisecond before it. */
function windowText(update: MarketingUpdate): string {
  const from = shortDate(update.startsAt);
  return update.endsAt === null ? `From ${from}` : `${from} to ${shortDate(update.endsAt - 1)}`;
}

/** `2026-09-17`, local, which is the only format a date input takes. */
function dayInput(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local midnight at the start of a date input's day, or null when it is empty. */
function dayStart(value: string, offsetDays = 0): number | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day + offsetDays).getTime();
}

function toDraft(update: MarketingUpdate | null): Draft {
  if (!update) {
    return {
      title: "",
      body: "",
      imageUrl: "",
      linkLabel: "",
      linkHref: "",
      tone: "wine",
      pinned: false,
      status: "draft",
      firstDay: "",
      lastDay: "",
    };
  }
  return {
    title: update.title,
    body: update.body,
    imageUrl: update.imageUrl,
    linkLabel: update.linkLabel,
    linkHref: update.linkHref,
    tone: update.tone,
    pinned: update.pinned,
    status: update.status,
    firstDay: dayInput(update.startsAt),
    lastDay: update.endsAt === null ? "" : dayInput(update.endsAt - 1),
  };
}

function toBody(draft: Draft) {
  return {
    title: draft.title.trim(),
    body: draft.body.trim(),
    imageUrl: draft.imageUrl,
    linkLabel: draft.linkLabel.trim(),
    linkHref: draft.linkHref.trim(),
    tone: draft.tone,
    pinned: draft.pinned,
    status: draft.status,
    // 0 asks the server for "from now".
    startsAt: dayStart(draft.firstDay) ?? 0,
    // Midnight after the last day, so the card stays up for the whole of it.
    endsAt: dayStart(draft.lastDay, 1),
  };
}

export default function UpdatesPage() {
  const { data, error, loading, reload } = useAsync<UpdateList>(
    (signal) => api.get<UpdateList>("/admin/marketing/updates", signal),
    [],
    { keepPrevious: true },
  );

  const [sheet, setSheet] = useState<{ id: string | null; draft: Draft; meta: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);
  /* Read once for the life of the screen, so a row cannot change its status
     between two renders of the same list. */
  const [now] = useState(() => Date.now());

  const rows = data?.items ?? [];
  const liveCount = rows.filter((update) => phaseOf(update, now) === "live").length;

  function open(update: MarketingUpdate | null) {
    setActionError(null);
    setSheet({
      id: update?.id ?? null,
      draft: toDraft(update),
      meta: update
        ? `Added ${shortDate(update.createdAt)}${update.createdByName ? ` by ${update.createdByName}` : ""}.`
        : "It shows on the marketer app's home screen once it is live.",
    });
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setSheet((current) => (current ? { ...current, draft: { ...current.draft, [key]: value } } : current));
  }

  const body = sheet ? toBody(sheet.draft) : null;
  // The API's own check, so Save is never a round trip that comes back saying no.
  const refusal = body ? updateRefusal({ ...body, startsAt: body.startsAt || now }) : null;

  async function save() {
    if (!sheet || !body || refusal) return;
    setBusy(true);
    setActionError(null);
    try {
      if (sheet.id) {
        await api.patch<{ update: MarketingUpdate }>(`/admin/marketing/updates/${sheet.id}`, body);
      } else {
        await api.post<{ update: MarketingUpdate }>("/admin/marketing/updates", body);
      }
      setSheet(null);
      reload();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!sheet?.id) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.del<{ ok: true }>(`/admin/marketing/updates/${sheet.id}`);
      setSheet(null);
      reload();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<MarketingUpdate>[] = [
    {
      key: "update",
      header: "Update",
      primary: true,
      render: (update) => (
        /* Capped on the desktop table. The meta line is a card's whole body, and
           uncapped it took the width the dates and the pin need, then pushed the
           Edit button off a laptop-width table. */
        <span className="block md:max-w-[22rem] 2xl:max-w-[34rem]">
          <IdCell
            thumb={
              update.imageUrl ? (
                <img src={update.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Megaphone className="h-4 w-4" aria-hidden="true" />
              )
            }
            title={update.title}
            meta={update.body || (update.linkLabel ? `Button: ${update.linkLabel}` : "No text")}
            trailing={
              /* Below `sm` only, where the card drops the Pinned column. */
              update.pinned ? (
                <Pin className="h-3.5 w-3.5 shrink-0 text-slate-550 sm:hidden" aria-label="Pinned" />
              ) : null
            }
          />
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      tight: true,
      mobile: "keep",
      badge: true,
      render: (update) => {
        const phase = PHASE[phaseOf(update, now)];
        return <Badge tone={phase.tone}>{phase.label}</Badge>;
      },
    },
    {
      key: "window",
      header: "Shows",
      mobile: "keep",
      render: (update) => <span className="text-slate-600">{windowText(update)}</span>,
    },
    {
      key: "pinned",
      header: "Pinned",
      mobile: "tablet",
      render: (update) =>
        update.pinned ? (
          <span className="inline-flex items-center gap-1 font-medium text-plum-950">
            <Pin className="h-3.5 w-3.5" aria-hidden="true" />
            Pinned
          </span>
        ) : (
          <span className="text-slate-600">Not pinned</span>
        ),
    },
    {
      key: "actions",
      header: "Actions",
      tight: true,
      // No `mobile`, so the card drops this column and takes `rowAction` instead.
      render: (update) => (
        <Button size="sm" variant="ghost" onClick={() => open(update)}>
          Edit
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={Megaphone}
        title="Updates"
        subtitle={
          data
            ? `${liveCount} live now. New listings get a card of their own for three weeks.`
            : "News cards at the top of the marketer app."
        }
        actions={
          <Button onClick={() => open(null)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            New update
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorNote error={error} onRetry={reload} />
        </div>
      )}

      <DataTable
        caption="Updates"
        columns={columns}
        rows={rows}
        rowKey={(update) => update.id}
        rowAction={(update) => (
          <Button size="sm" variant="ghost" onClick={() => open(update)}>
            Edit
          </Button>
        )}
        loading={loading}
        empty={
          error ? null : (
            <EmptyState
              bare
              icon={Megaphone}
              title="No updates yet"
              hint="Write one and set it live, and it leads the home screen of every marketer's app."
              action={<Button onClick={() => open(null)}>New update</Button>}
            />
          )
        }
      />

      <BottomSheet
        open={sheet !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setSheet(null);
        }}
        title={sheet?.id ? "Edit update" : "New update"}
        description={sheet?.meta}
        widthClassName="sm:w-[min(40rem,calc(100vw-2rem))]"
        footer={
          <div className="flex items-center gap-2">
            {sheet?.id && (
              <ConfirmButton confirmLabel="Yes, delete it" onConfirm={() => void remove()} disabled={busy}>
                Delete
              </ConfirmButton>
            )}
            <Button variant="ghost" className="ml-auto" onClick={() => setSheet(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy || refusal !== null}>
              {busy ? "Saving" : sheet?.id ? "Save changes" : "Add update"}
            </Button>
          </div>
        }
      >
        {sheet && (
          <div className="space-y-4">
            {actionError && <ErrorNote error={actionError} />}
            {refusal && sheet.draft.title.trim() !== "" && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                {refusal.message}
              </p>
            )}

            <Field label="Title" hint="One line a marketer reads at a glance.">
              <input
                className={inputClass}
                value={sheet.draft.title}
                maxLength={UPDATE_TITLE_MAX}
                placeholder="Site visits every Saturday in Lekki"
                onChange={(event) => set("title", event.target.value)}
              />
            </Field>

            <Field label="Text" hint="Optional. Two or three short sentences at most.">
              <textarea
                className={`${inputClass} resize-none`}
                rows={3}
                value={sheet.draft.body}
                maxLength={UPDATE_BODY_MAX}
                placeholder="Bring your buyers to the show homes at 10am. Our team runs the tour."
                onChange={(event) => set("body", event.target.value)}
              />
            </Field>

            {/* `as="group"`, not a label: ImagePicker owns a hidden file input,
                and a bare label forwards a tap on its own whitespace to it. */}
            <Field label="Picture" hint="Optional. A wide photo reads best on a phone." as="group">
              <ImagePicker
                value={sheet.draft.imageUrl ? [sheet.draft.imageUrl] : []}
                onChange={(urls) => set("imageUrl", urls[0] ?? "")}
                max={1}
                coverLabel="Picture"
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Button" hint="Optional. What it says, such as See the homes.">
                <input
                  className={inputClass}
                  value={sheet.draft.linkLabel}
                  maxLength={UPDATE_LINK_LABEL_MAX}
                  placeholder="See the homes"
                  onChange={(event) => set("linkLabel", event.target.value)}
                />
              </Field>
              <Field label="Button link" hint="A screen in the app, such as /m/listings, or a web address.">
                <input
                  className={inputClass}
                  inputMode="url"
                  value={sheet.draft.linkHref}
                  maxLength={UPDATE_LINK_MAX}
                  placeholder="/m/listings"
                  onChange={(event) => set("linkHref", event.target.value)}
                />
              </Field>
            </div>

            <Field label="Colour" as="group">
              <div className="grid grid-cols-3 gap-2">
                {MARKETING_UPDATE_TONES.map((tone) => (
                  <label
                    key={tone}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                      sheet.draft.tone === tone
                        ? "border-wine-500 bg-wine-50/50"
                        : "border-mist-200 hover:bg-mist-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="update-tone"
                      value={tone}
                      checked={sheet.draft.tone === tone}
                      onChange={() => set("tone", tone)}
                      className="shrink-0"
                    />
                    <span aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 rounded-full ${TONE[tone].swatch}`} />
                    <span className="text-[13px] font-semibold text-plum-950">{TONE[tone].label}</span>
                  </label>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First day" hint="Empty means from the moment you save.">
                <input
                  type="date"
                  className={inputClass}
                  value={sheet.draft.firstDay}
                  onChange={(event) => set("firstDay", event.target.value)}
                />
              </Field>
              <Field label="Last day" hint="Empty means until you take it down.">
                <input
                  type="date"
                  className={inputClass}
                  value={sheet.draft.lastDay}
                  onChange={(event) => set("lastDay", event.target.value)}
                />
              </Field>
            </div>

            <Switch
              checked={sheet.draft.pinned}
              onChange={(next) => set("pinned", next)}
              label="Pin to the front"
              description="Pinned cards come first, ahead of anything newer."
            />

            {/* Radios, not a switch. Two named outcomes with a line each, and
                "off" would leave the reader to work out which one it means. */}
            <Field label="Who sees it" as="group">
              <div className="grid gap-2 sm:grid-cols-2">
                {MARKETING_UPDATE_STATUSES.map((value) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                      sheet.draft.status === value
                        ? "border-wine-500 bg-wine-50/50"
                        : "border-mist-200 hover:bg-mist-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="update-status"
                      value={value}
                      checked={sheet.draft.status === value}
                      onChange={() => set("status", value)}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-plum-950">
                        {STATUS[value].label}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-600">
                        {STATUS[value].blurb}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

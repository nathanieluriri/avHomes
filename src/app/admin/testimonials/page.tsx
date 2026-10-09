"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Quote, Star } from "lucide-react";
import type { Testimonial } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { toApiError } from "@/lib/admin/marketing";
import ImagePicker from "@/components/admin/ImagePicker";
import { BottomSheet } from "@/components/admin/BottomSheet";
import {
  Button,
  ConfirmButton,
  EmptyState,
  ErrorNote,
  Field,
  PageHeader,
  inputClass,
} from "@/components/admin/ui";
import { DataTable, IdCell, type Column } from "@/components/admin/DataTable";

/**
 * The quotes on the homepage. The site reads them in `position` order and
 * refreshes within about ten minutes of a save.
 */

type Draft = Omit<Testimonial, "id" | "position">;

const BLANK: Draft = { name: "", role: "", quote: "", rating: 5, initials: "", photoUrl: "" };

function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TestimonialsPage() {
  const { data, loading, error, reload } = useAsync(
    (signal) => api.get<{ items: Testimonial[] }>("/admin/testimonials", signal),
    [],
  );
  const rows = data?.items ?? [];

  const [sheet, setSheet] = useState<{ id: string | null; position: number; draft: Draft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<ApiError | null>(null);

  function open(item: Testimonial | null) {
    setActionError(null);
    setSheet(
      item
        ? {
            id: item.id,
            position: item.position,
            draft: {
              name: item.name,
              role: item.role,
              quote: item.quote,
              rating: item.rating,
              initials: item.initials,
              photoUrl: item.photoUrl,
            },
          }
        : {
            id: null,
            position: rows.reduce((max, row) => Math.max(max, row.position + 1), 0),
            draft: BLANK,
          },
    );
  }

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setSheet((current) => (current ? { ...current, draft: { ...current.draft, [key]: value } } : current));
  }

  async function put(id: string | null, body: Draft & { position: number }) {
    await api.put(`/admin/testimonials/${id ?? "new"}`, {
      ...body,
      name: body.name.trim(),
      role: body.role.trim(),
      quote: body.quote.trim(),
      initials: (body.initials.trim() || initialsOf(body.name)).slice(0, 4),
    });
  }

  async function save() {
    if (!sheet) return;
    setBusy(true);
    setActionError(null);
    try {
      await put(sheet.id, { ...sheet.draft, position: sheet.position });
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
      await api.del(`/admin/testimonials/${sheet.id}`);
      setSheet(null);
      reload();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  /* Rewrites every position, so rows saved with duplicate positions settle into a real order. */
  async function move(index: number, by: -1 | 1) {
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    setBusy(true);
    setActionError(null);
    try {
      await Promise.all(
        next.map((row, position) =>
          row.position === position && row.id !== item.id ? null : put(row.id, { ...row, position }),
        ),
      );
      reload();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Testimonial>[] = [
    {
      key: "who",
      header: "Client",
      primary: true,
      render: (item) => (
        <span className="block md:max-w-[34rem]">
          <IdCell
            thumb={
              item.photoUrl ? (
                <img src={item.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold">{item.initials || initialsOf(item.name)}</span>
              )
            }
            title={item.name}
            meta={item.quote}
          />
        </span>
      ),
    },
    {
      key: "role",
      header: "Who they are",
      mobile: "tablet",
      render: (item) => <span className="text-slate-600">{item.role || "Not set"}</span>,
    },
    {
      key: "rating",
      header: "Rating",
      tight: true,
      mobile: "keep",
      render: (item) => (
        <span className="inline-flex items-center gap-1 font-medium text-plum-950">
          <Star className="h-3.5 w-3.5 fill-current text-wine-600" strokeWidth={0} aria-hidden="true" />
          {item.rating}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      tight: true,
      render: (item) => <RowActions index={rows.indexOf(item)} item={item} />,
    },
  ];

  function RowActions({ index, item }: { index: number; item: Testimonial }) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Move ${item.name} up`}
          disabled={busy || index <= 0}
          onClick={() => void move(index, -1)}
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Move ${item.name} down`}
          disabled={busy || index >= rows.length - 1}
          onClick={() => void move(index, 1)}
        >
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => open(item)}>
          Edit
        </Button>
      </span>
    );
  }

  const ready =
    sheet !== null && sheet.draft.name.trim() !== "" && sheet.draft.quote.trim() !== "";

  return (
    <>
      <PageHeader
        icon={Quote}
        title="Testimonials"
        subtitle="The client quotes on the homepage, in this order. Changes show on the site within about ten minutes."
        actions={
          <Button onClick={() => open(null)}>
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            New testimonial
          </Button>
        }
      />

      {(error || actionError) && !sheet && (
        <div className="mb-4">
          <ErrorNote error={(error ?? actionError)!} onRetry={error ? reload : undefined} />
        </div>
      )}

      <DataTable
        caption="Testimonials"
        columns={columns}
        rows={rows}
        rowKey={(item) => item.id}
        rowAction={(item) => <RowActions index={rows.indexOf(item)} item={item} />}
        loading={loading}
        empty={
          error ? null : (
            <EmptyState
              bare
              icon={Quote}
              title="No testimonials yet"
              hint="Add one and it shows in the homepage's testimonials section."
              action={<Button onClick={() => open(null)}>New testimonial</Button>}
            />
          )
        }
      />

      <BottomSheet
        open={sheet !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setSheet(null);
        }}
        title={sheet?.id ? "Edit testimonial" : "New testimonial"}
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
            <Button onClick={() => void save()} disabled={busy || !ready}>
              {busy ? "Saving" : sheet?.id ? "Save changes" : "Add testimonial"}
            </Button>
          </div>
        }
      >
        {sheet && (
          <div className="space-y-4">
            {actionError && <ErrorNote error={actionError} />}

            <Field label="What they said">
              <textarea
                className={`${inputClass} resize-none`}
                rows={4}
                maxLength={2000}
                value={sheet.draft.quote}
                placeholder="They told me not to buy something. That is why I keep coming back."
                onChange={(event) => set("quote", event.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  className={inputClass}
                  maxLength={200}
                  value={sheet.draft.name}
                  placeholder="Samson Ghani"
                  onChange={(event) => set("name", event.target.value)}
                />
              </Field>
              <Field label="Who they are" hint="Optional, such as Homeowner, Lekki.">
                <input
                  className={inputClass}
                  maxLength={200}
                  value={sheet.draft.role}
                  placeholder="Repeat client"
                  onChange={(event) => set("role", event.target.value)}
                />
              </Field>
            </div>

            <Field label="Rating" as="group">
              <div className="flex gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={sheet.draft.rating === value}
                    aria-label={`${value} star${value === 1 ? "" : "s"}`}
                    onClick={() => set("rating", value)}
                    className="rounded-md p-1 text-wine-600 hover:bg-mist-50"
                  >
                    <Star
                      className={`h-6 w-6 ${value <= sheet.draft.rating ? "fill-current" : ""}`}
                      strokeWidth={value <= sheet.draft.rating ? 0 : 1.5}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Photo"
              hint="Optional. A square face shot. Without one the site shows a stock portrait."
              as="group"
            >
              <ImagePicker
                value={sheet.draft.photoUrl ? [sheet.draft.photoUrl] : []}
                onChange={(urls) => set("photoUrl", urls[0] ?? "")}
                max={1}
                coverLabel="Photo"
              />
            </Field>
          </div>
        )}
      </BottomSheet>
    </>
  );
}

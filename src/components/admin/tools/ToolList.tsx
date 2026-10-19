"use client";

import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, type LucideIcon } from "lucide-react";
import type { MarketingTools, ToolList as ListKey } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { toApiError } from "@/lib/admin/marketing";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Badge, Button, ConfirmButton, EmptyState, ErrorNote, IconButton, Skeleton } from "@/components/admin/ui";
import { DataTable, IdCell, type Column } from "@/components/admin/DataTable";

export const TOOLS_PATH = "/admin/marketing/tools";

/** The lists, with what the last save answered standing in until the next reload. */
export function useTools() {
  const read = useAsync((signal) => api.get<MarketingTools>(TOOLS_PATH, signal), []);
  const [saved, setSaved] = useState<MarketingTools | null>(null);
  return {
    data: saved ?? read.data,
    error: read.error,
    reload: () => {
      setSaved(null);
      read.reload();
    },
    setData: setSaved,
  };
}

type Item = { id: string; hidden?: boolean };

/**
 * One editable list: rows in partner order, move up and down, and a sheet to
 * add, edit, hide or delete. Every save writes the whole list.
 */
export function ToolListEditor<K extends ListKey>({
  list,
  noun,
  icon,
  tools,
  onSaved,
  title,
  meta,
  extra,
  blank,
  ready,
  form,
  emptyHint,
}: {
  list: K;
  noun: string;
  icon: LucideIcon;
  tools: MarketingTools;
  onSaved: (next: MarketingTools) => void;
  title: (item: MarketingTools[K][number]) => string;
  meta: (item: MarketingTools[K][number]) => string;
  extra?: (item: MarketingTools[K][number]) => ReactNode;
  blank: () => MarketingTools[K][number];
  ready: (draft: MarketingTools[K][number]) => boolean;
  form: (draft: MarketingTools[K][number], set: (patch: Partial<MarketingTools[K][number]>) => void) => ReactNode;
  emptyHint: string;
}) {
  type T = MarketingTools[K][number];
  const rows = tools[list] as T[];
  const [sheet, setSheet] = useState<{ draft: T; isNew: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function save(next: T[]): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      onSaved(await api.put<MarketingTools>(`${TOOLS_PATH}/${list}`, { items: next }));
      return true;
    } catch (err) {
      setError(toApiError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!sheet) return;
    const next = sheet.isNew
      ? [...rows, sheet.draft]
      : rows.map((row) => ((row as Item).id === (sheet.draft as Item).id ? sheet.draft : row));
    if (await save(next)) setSheet(null);
  }

  async function remove() {
    if (!sheet) return;
    if (await save(rows.filter((row) => (row as Item).id !== (sheet.draft as Item).id))) setSheet(null);
  }

  function move(index: number, by: -1 | 1) {
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    void save(next);
  }

  function open(item: T | null) {
    setError(null);
    setSheet(item ? { draft: item, isNew: false } : { draft: blank(), isNew: true });
  }

  function RowActions({ item }: { item: T }) {
    const index = rows.indexOf(item);
    return (
      <span className="inline-flex items-center gap-1">
        {extra?.(item)}
        <IconButton size="dense" label={`Move ${title(item)} up`} icon={ArrowUp} disabled={busy || index <= 0} onClick={() => move(index, -1)} />
        <IconButton
          size="dense"
          label={`Move ${title(item)} down`}
          icon={ArrowDown}
          disabled={busy || index >= rows.length - 1}
          onClick={() => move(index, 1)}
        />
        <Button size="sm" variant="ghost" onClick={() => open(item)}>
          Edit
        </Button>
      </span>
    );
  }

  const columns: Column<T>[] = [
    {
      key: "what",
      header: noun,
      primary: true,
      render: (item) => (
        <span className="block md:max-w-[36rem]">
          <IdCell title={title(item)} meta={meta(item)} />
        </span>
      ),
    },
    {
      key: "shown",
      header: "Partners see it",
      tight: true,
      mobile: "keep",
      render: (item) =>
        "hidden" in (item as object) ? (
          <Badge tone={(item as Item).hidden ? "neutral" : "green"}>{(item as Item).hidden ? "Hidden" : "Shown"}</Badge>
        ) : (
          <Badge tone="green">Shown</Badge>
        ),
    },
    { key: "actions", header: "Actions", tight: true, render: (item) => <RowActions item={item} /> },
  ];

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-600">Partners see these in this order.</p>
        <Button onClick={() => open(null)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          New {noun.toLowerCase()}
        </Button>
      </div>
      {error && !sheet && (
        <div className="mb-4">
          <ErrorNote error={error} />
        </div>
      )}
      <DataTable
        caption={noun}
        columns={columns}
        rows={rows}
        rowKey={(item) => (item as Item).id}
        rowAction={(item) => <RowActions item={item} />}
        empty={
          <EmptyState
            bare
            icon={icon}
            title={`No ${noun.toLowerCase()}s yet`}
            hint={emptyHint}
            action={<Button onClick={() => open(null)}>New {noun.toLowerCase()}</Button>}
          />
        }
      />
      <BottomSheet
        open={sheet !== null}
        onOpenChange={(next) => {
          if (!next && !busy) setSheet(null);
        }}
        title={sheet?.isNew ? `New ${noun.toLowerCase()}` : `Edit ${noun.toLowerCase()}`}
        widthClassName="sm:w-[min(40rem,calc(100vw-2rem))]"
        footer={
          <div className="flex items-center gap-2">
            {sheet && !sheet.isNew && (
              <ConfirmButton confirmLabel="Yes, delete it" onConfirm={() => void remove()} disabled={busy}>
                Delete
              </ConfirmButton>
            )}
            <Button variant="ghost" className="ml-auto" onClick={() => setSheet(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void commit()} disabled={busy || !sheet || !ready(sheet.draft)}>
              {busy ? "Saving" : sheet?.isNew ? `Add ${noun.toLowerCase()}` : "Save changes"}
            </Button>
          </div>
        }
      >
        {sheet && (
          <div className="space-y-4">
            {error && <ErrorNote error={error} />}
            {form(sheet.draft, (patch) =>
              setSheet((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current)),
            )}
          </div>
        )}
      </BottomSheet>
    </>
  );
}

export function ToolsLoading() {
  return <Skeleton className="h-64" />;
}

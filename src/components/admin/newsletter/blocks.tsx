"use client";

/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import {
  BLOCK_TEXT_MAX,
  CALLOUT_DEFAULTS,
  LISTING_CARD_DEFAULTS,
  type CalloutAttrs,
  type ListingCardAttrs,
  type Page,
  type Property,
} from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync, useDebounced } from "@/lib/admin/hooks";
import { cardFromProperty } from "@/lib/admin/newsletter-templates";
import { BottomSheet } from "../BottomSheet";
import { inputClass } from "../ui";

function stringAttrs<T extends object>(defaults: T) {
  return Object.fromEntries(Object.keys(defaults).map((key) => [key, { default: "" }]));
}

export const ListingCard = Node.create({
  name: "listingCard",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes: () => stringAttrs(LISTING_CARD_DEFAULTS),
  parseHTML: () => [{ tag: "div[data-listing-card]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-listing-card": "" })],
  addNodeView: () => ReactNodeViewRenderer(ListingCardView),
});

export const Callout = Node.create({
  name: "callout",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes: () => stringAttrs(CALLOUT_DEFAULTS),
  parseHTML: () => [{ tag: "div[data-callout]" }],
  renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-callout": "" })],
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
});

const CHIP =
  "inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[11px] font-semibold text-plum-950 shadow-sm ring-1 ring-mist-200 hover:bg-white";

function ListingCardView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const a = node.attrs as ListingCardAttrs;
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const editable = editor.isEditable;

  async function refresh() {
    if (!a.propertyId) return;
    setRefreshing(true);
    try {
      const res = await api.get<{ property: Property }>(`/admin/properties/${encodeURIComponent(a.propertyId)}`);
      updateAttributes(cardFromProperty(res.property, window.location.origin));
    } catch {
      // The listing may have been deleted. The card keeps what it had.
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <NodeViewWrapper className="nl-block" data-drag-handle="">
      <div contentEditable={false} className="relative my-3 overflow-hidden rounded-xl border border-[#eadfe4] bg-[#fbf7f9]">
        {a.imageUrl && <img src={a.imageUrl} alt="" className="block max-h-56 w-full object-cover" />}
        <div className="px-4 py-3.5">
          {editing ? (
            <div className="space-y-2">
              <input className={inputClass} value={a.title} maxLength={BLOCK_TEXT_MAX.title} placeholder="Title" onChange={(e) => updateAttributes({ title: e.target.value })} />
              <textarea className={`${inputClass} resize-none`} rows={2} value={a.blurb} maxLength={BLOCK_TEXT_MAX.blurb} placeholder="One line about it" onChange={(e) => updateAttributes({ blurb: e.target.value })} />
              <input className={inputClass} value={a.price} maxLength={BLOCK_TEXT_MAX.price} placeholder="Price" onChange={(e) => updateAttributes({ price: e.target.value })} />
              <div className="flex gap-1">
                <button type="button" className={CHIP} onClick={() => setEditing(false)}>
                  Done
                </button>
                {a.imageUrl && (
                  <button type="button" className={CHIP} onClick={() => updateAttributes({ imageUrl: "" })}>
                    Remove picture
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="m-0 text-[15px] font-bold leading-snug text-plum-950">{a.title || "Untitled listing"}</p>
              {a.blurb && <p className="m-0 mt-1 text-[13px] leading-relaxed text-slate-500">{a.blurb}</p>}
              {a.price && <p className="m-0 mt-2 text-[19px] font-bold text-wine-700">{a.price}</p>}
              {a.href && <p className="m-0 mt-2 text-[13px] font-semibold text-wine-700 underline">See the listing ›</p>}
            </>
          )}
        </div>
        {editable && !editing && (
          <div className="absolute right-2 top-2 flex gap-1">
            <button type="button" className={CHIP} onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" aria-hidden="true" /> Edit
            </button>
            {a.propertyId && (
              <button type="button" className={CHIP} onClick={() => void refresh()} disabled={refreshing} title="Update the price, picture and title from the listing">
                <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
              </button>
            )}
            <button type="button" className={CHIP} onClick={deleteNode} aria-label="Remove card">
              <Trash2 className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

const DARK_INPUT =
  "w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 outline-none placeholder:text-white/40 hover:border-white/15 focus:border-white/30";

function CalloutView({ node, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const a = node.attrs as CalloutAttrs;
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper className="nl-block" data-drag-handle="">
      <div contentEditable={false} className="relative my-3 rounded-xl bg-[#2a1420] px-4 py-4">
        <input
          className={`${DARK_INPUT} text-[11px] font-bold uppercase tracking-[0.14em] text-[#e8a0b4]`}
          value={a.eyebrow}
          maxLength={BLOCK_TEXT_MAX.eyebrow}
          placeholder="Small label"
          readOnly={!editable}
          onChange={(e) => updateAttributes({ eyebrow: e.target.value })}
        />
        <input
          className={`${DARK_INPUT} mt-1 text-[19px] font-bold text-white`}
          value={a.title}
          maxLength={BLOCK_TEXT_MAX.title}
          placeholder="Headline"
          readOnly={!editable}
          onChange={(e) => updateAttributes({ title: e.target.value })}
        />
        <textarea
          className={`${DARK_INPUT} mt-1 resize-none text-[14px] leading-relaxed text-[#e5d9de]`}
          rows={2}
          value={a.text}
          maxLength={BLOCK_TEXT_MAX.text}
          placeholder="A line or two"
          readOnly={!editable}
          onChange={(e) => updateAttributes({ text: e.target.value })}
        />
        {editable && (
          <button type="button" className={`${CHIP} absolute right-2 top-2`} onClick={deleteNode} aria-label="Remove callout">
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** Search live listings and hand back the chosen one as a card. */
export function ListingPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (attrs: ListingCardAttrs) => void;
}) {
  const [term, setTerm] = useState("");
  const query = useDebounced(term, 250);
  const found = useAsync(
    (signal) =>
      open
        ? api.get<Page<Property>>(
            `/admin/properties?status=live&sort=newest&limit=8${query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ""}`,
            signal,
          )
        : Promise.resolve(null),
    [open, query],
  );
  const items = found.data?.items ?? [];

  return (
    <BottomSheet open={open} onOpenChange={(next) => !next && onClose()} title="Add a listing card" description="Live listings, newest first.">
      <div className="space-y-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <input
            className={`${inputClass} pl-9`}
            value={term}
            placeholder="Search by title or area"
            aria-label="Search listings"
            onChange={(e) => setTerm(e.target.value)}
          />
        </label>
        {found.loading && <p className="text-[13px] text-slate-600">Searching</p>}
        {!found.loading && items.length === 0 && <p className="text-[13px] text-slate-600">Nothing matched.</p>}
        <ul className="divide-y divide-mist-100 overflow-hidden rounded-xl border border-mist-200">
          {items.map((property) => {
            const attrs = cardFromProperty(property, window.location.origin);
            return (
              <li key={property.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-mist-50"
                  onClick={() => {
                    onPick(attrs);
                    onClose();
                  }}
                >
                  <span className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-mist-100">
                    {attrs.imageUrl && <img src={attrs.imageUrl} alt="" className="h-full w-full object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-plum-950">{property.title}</span>
                    <span className="block truncate text-[12px] text-slate-600">{[property.city, attrs.price].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}

"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Pencil } from "lucide-react";
import {
  SEO_DESCRIPTION_ADVISED,
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_ADVISED,
  SEO_TITLE_MAX,
  estateSummary,
  formatPrice,
  isEstate,
  listingSeoDescription,
  listingSeoTitle,
  toHandle,
  type Property,
} from "@avhomes/contracts";
import { SITE_NAME } from "@/lib/api-config";
import { inputClass } from "@/components/admin/ui";

export interface SearchDraft {
  seoTitle: string;
  seoDescription: string;
  /** As typed. `toHandle` cleans it on save. */
  handle: string;
}

const noSubscribe = () => () => {};

/** Lowercase, and anything that is not a letter or digit becomes one hyphen, as it is typed. */
function typedHandle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-");
}

function Count({ used, advised }: { used: number; advised: number }) {
  const over = used > advised;
  return (
    <span className={`mt-1 block text-xs ${over ? "text-amber-700" : "text-slate-600"}`}>
      {used} of {advised} characters used{over ? ". Search engines will cut the rest." : ""}
    </span>
  );
}

/**
 * How the listing reads as a search result, and the three things that decide it.
 *
 * The snippet is drawn from `preview`, the draft as the site would receive it,
 * so it changes as the title, price or tagline above it do. An empty title or
 * description falls back to the same words the page itself would use.
 */
export function SearchListing({
  preview,
  value,
  onChange,
  savedSlug,
  published,
}: {
  preview: Property;
  value: SearchDraft;
  onChange: (patch: Partial<SearchDraft>) => void;
  savedSlug: string | null;
  published: boolean;
}) {
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");

  const title = listingSeoTitle(preview);
  const description = listingSeoDescription(preview);
  const handle = toHandle(value.handle) ?? savedSlug ?? toHandle(preview.title) ?? "";
  const moved = published && savedSlug !== null && toHandle(value.handle) !== null && toHandle(value.handle) !== savedSlug;
  const summary = isEstate(preview.type) ? estateSummary(preview.prototypes) : null;
  const priceMinor = summary ? summary.fromMinor : preview.priceMinor;
  const price = priceMinor > 0 ? `${summary ? "From " : ""}${formatPrice(priceMinor, preview)}` : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-plum-950">Search engine listing</h2>
        <button
          type="button"
          onClick={() => setEditing((on) => !on)}
          aria-expanded={editing}
          aria-controls={`${uid}-fields`}
          aria-label={editing ? "Done editing the search listing" : "Edit the search listing"}
          className="c-tap -m-1.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 sm:h-8 sm:w-8"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* The result as a search engine draws it. */}
      <div className="mt-4 min-w-0">
        <p className="text-[14px] text-plum-950">{SITE_NAME}</p>
        <p className="truncate text-xs text-slate-600">
          {origin} › listings › {handle}
        </p>
        <p className="mt-1 line-clamp-1 text-[18px] leading-snug text-[#1a0dab]">{title}</p>
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-600">{description}</p>
        {price && <p className="mt-1.5 text-[13px] text-slate-600">{price}</p>}
      </div>

      {editing && (
        <div id={`${uid}-fields`} className="mt-5 space-y-4 border-t border-mist-200 pt-5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">Page title</span>
            <input
              className={inputClass}
              maxLength={SEO_TITLE_MAX}
              value={value.seoTitle}
              placeholder={preview.title}
              onChange={(e) => onChange({ seoTitle: e.target.value })}
            />
            <Count used={title.length} advised={SEO_TITLE_ADVISED} />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Meta description
            </span>
            <textarea
              className={`${inputClass} min-h-24`}
              maxLength={SEO_DESCRIPTION_MAX}
              value={value.seoDescription}
              placeholder={listingSeoDescription({ ...preview, seoDescription: "" })}
              onChange={(e) => onChange({ seoDescription: e.target.value })}
            />
            <Count used={description.length} advised={SEO_DESCRIPTION_ADVISED} />
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">URL handle</span>
            {/* inputClass's tokens on the wrapper, so the fixed prefix and the typed part read as one box. */}
            <span className="flex items-stretch overflow-hidden rounded-lg border border-mist-200 bg-white transition-colors focus-within:border-wine-500">
              <span className="inline-flex items-center border-r border-mist-200 bg-mist-50 px-3 text-[13px] text-slate-600">
                listings/
              </span>
              <input
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[13px] text-plum-950 outline-none placeholder:text-slate-550"
                autoCapitalize="none"
                spellCheck={false}
                value={value.handle}
                placeholder={toHandle(preview.title) ?? ""}
                onChange={(e) => onChange({ handle: typedHandle(e.target.value) })}
              />
            </span>
            <span className="mt-1 block break-all text-xs text-slate-600">
              {origin}/listings/{handle}
            </span>
            {moved && (
              <span className="mt-1 block text-xs text-amber-700">
                The old address, /listings/{savedSlug}, will keep working and send visitors here.
              </span>
            )}
            {!published && (
              <span className="mt-1 block text-xs text-slate-600">
                Left blank, it is made from the title when you publish.
              </span>
            )}
          </label>
        </div>
      )}
    </div>
  );
}

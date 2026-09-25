"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "radix-ui";
import { AtSign, Check, ChevronDown, History, Search, SlidersHorizontal, X } from "lucide-react";
import type { MailListFilters, MailRecipient } from "@avhomes/contracts";
import { BottomSheet } from "@/components/admin/BottomSheet";
import { Button, Field, inputClass } from "@/components/admin/ui";
import { shortDate } from "@/lib/admin/format";
import { activeFilters, daysAgo } from "./shared";

/* ───────────────────────────── search bar ────────────────────────────── */

/**
 * One wide field, with the full criteria one toggle away underneath it.
 * The text goes to Hostinger as its `text` criterion: headers and body.
 */
export function MailSearchBar({
  value,
  onChange,
  onSubmit,
  filters,
  recipients,
  onApply,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  filters: MailListFilters;
  recipients: MailRecipient[];
  onApply: (next: MailListFilters) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0 flex-1 sm:relative">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex h-11 items-center gap-1 rounded-lg border border-mist-200 bg-white pl-3 pr-1 transition-colors focus-within:border-wine-500 sm:h-10"
      >
        <Search className="h-4 w-4 shrink-0 text-slate-550" aria-hidden="true" />
        <input
          type="search"
          value={value}
          aria-label="Search mail"
          placeholder="Search mail"
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent px-2 text-[13px] text-plum-950 outline-none placeholder:text-slate-550 [&::-webkit-search-cancel-button]:hidden"
        />
        {value !== "" && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange("")}
            className="c-tap grid h-8 w-8 place-items-center rounded-md text-slate-550 hover:bg-mist-100 hover:text-plum-950"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          aria-label="Show search options"
          aria-expanded={open}
          title="Show search options"
          onClick={() => setOpen((v) => !v)}
          className={`c-tap grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-mist-100 ${
            open ? "bg-mist-100 text-wine-700" : "text-slate-550 hover:text-plum-950"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      {open && (
        <AdvancedSearch
          filters={{ ...filters, q: value || undefined }}
          recipients={recipients}
          onClose={() => setOpen(false)}
          onApply={(next) => {
            setOpen(false);
            onApply(next);
          }}
        />
      )}
    </div>
  );
}

function AdvancedSearch({
  filters,
  recipients,
  onClose,
  onApply,
}: {
  filters: MailListFilters;
  recipients: MailRecipient[];
  onClose: () => void;
  onApply: (next: MailListFilters) => void;
}) {
  const [f, setF] = useState<MailListFilters>(filters);
  const set = (key: keyof MailListFilters, value: string) =>
    setF((prev) => ({ ...prev, [key]: value.trim() === "" ? undefined : value }));

  return (
    <div
      role="dialog"
      aria-label="Search options"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl bg-white p-4 shadow-pop sm:p-5"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onApply(f);
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="From">
          <input className={inputClass} value={f.from ?? ""} onChange={(e) => set("from", e.target.value)} autoFocus />
        </Field>
        <Field label="Sent to" hint="An alias here, a Bcc or a forward all count.">
          <input
            className={inputClass}
            list="mail-recipients"
            value={f.to ?? ""}
            onChange={(e) => set("to", e.target.value)}
          />
          <datalist id="mail-recipients">
            {recipients.map((r) => (
              <option key={r.address} value={r.address} />
            ))}
          </datalist>
        </Field>
        <Field label="Subject">
          <input className={inputClass} value={f.subject ?? ""} onChange={(e) => set("subject", e.target.value)} />
        </Field>
        <Field label="Has the words">
          <input className={inputClass} value={f.q ?? ""} onChange={(e) => set("q", e.target.value)} />
        </Field>
        <Field label="Received on or after">
          <input type="date" className={inputClass} value={f.since ?? ""} onChange={(e) => set("since", e.target.value)} />
        </Field>
        <Field label="Received before">
          <input type="date" className={inputClass} value={f.before ?? ""} onChange={(e) => set("before", e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-plum-950 sm:col-span-2">
          <input
            type="checkbox"
            checked={f.attachment === "1"}
            onChange={(e) => setF((prev) => ({ ...prev, attachment: e.target.checked ? "1" : undefined }))}
            className="h-5 w-5 accent-[var(--wine-600)] md:h-4 md:w-4"
          />
          Has attachment
        </label>
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" onClick={() => setF({})}>
            Clear
          </Button>
          <Button type="submit">Search</Button>
        </div>
      </form>
    </div>
  );
}

/* ──────────────────────────────── chips ──────────────────────────────── */

const chipBase =
  "c-tap inline-flex h-8 max-w-[16rem] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors";
const chipIdle = "border-mist-200 bg-white text-plum-950 hover:bg-mist-50";
const chipOn = "border-wine-100 bg-wine-50 text-wine-700 hover:bg-wine-100";

function Chip({
  label,
  title,
  on,
  sheet,
  onReset,
  children,
}: {
  label: ReactNode;
  /** Names the sheet on a phone. */
  title: string;
  on: boolean;
  /** A bottom sheet under the thumb instead of a popover. */
  sheet: boolean;
  /** Draws an x on an applied chip that clears just this filter. */
  onReset?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const reset = on && onReset;
  const trigger = (
    <button
      type="button"
      data-on={on || undefined}
      onClick={sheet ? () => setOpen(true) : undefined}
      className={`${chipBase} ${on ? chipOn : chipIdle} ${reset ? "rounded-r-none border-r-0 pr-1.5" : ""}`}
    >
      <span className="truncate">{label}</span>
      {!reset && <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
    </button>
  );

  const pill = reset ? (
    <span className="inline-flex shrink-0 items-center">
      {sheet ? trigger : <Popover.Trigger asChild>{trigger}</Popover.Trigger>}
      <button
        type="button"
        aria-label={`Clear ${title}`}
        title={`Clear ${title}`}
        onClick={onReset}
        className={`c-tap grid h-8 w-8 shrink-0 place-items-center rounded-r-full border border-l-0 ${chipOn}`}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  ) : sheet ? (
    trigger
  ) : (
    <Popover.Trigger asChild>{trigger}</Popover.Trigger>
  );

  if (sheet) {
    return (
      <>
        {pill}
        <BottomSheet open={open} onOpenChange={setOpen} title={title}>
          {children(() => setOpen(false))}
        </BottomSheet>
      </>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {pill}
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          collisionPadding={16}
          className="console console-float z-[72] w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-mist-200 bg-white p-3 shadow-pop"
        >
          {children(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] sm:min-h-8 ${
        on ? "bg-wine-50 font-semibold text-wine-700" : "text-plum-950 hover:bg-mist-100"
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {on && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
    </button>
  );
}

function TextApply({
  label,
  initial,
  placeholder,
  onApply,
  focus = true,
}: {
  label: string;
  initial: string;
  placeholder: string;
  onApply: (value: string) => void;
  /** Off on a phone, where focusing raises the keyboard over the choices. */
  focus?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(value.trim());
      }}
    >
      <input
        className={inputClass}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        autoFocus={focus}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" size="md">
        Apply
      </Button>
    </form>
  );
}

const RANGES: { id: string; label: string; since?: () => string; before?: () => string }[] = [
  { id: "7d", label: "Last 7 days", since: () => daysAgo(7) },
  { id: "30d", label: "Last 30 days", since: () => daysAgo(30) },
  { id: "6m", label: "Last 6 months", since: () => daysAgo(182) },
  { id: "1y", label: "Last year", since: () => daysAgo(365) },
  { id: "old", label: "Older than a year", before: () => daysAgo(365) },
];

function rangeLabel(f: MailListFilters, preset: string | null): string {
  const found = RANGES.find((r) => r.id === preset);
  if (found) return found.label;
  const day = (v: string) => shortDate(Date.parse(`${v}T00:00:00`));
  if (f.since && f.before) return `${day(f.since)} to ${day(f.before)}`;
  if (f.since) return `Since ${day(f.since)}`;
  if (f.before) return `Before ${day(f.before)}`;
  return "Any time";
}

function short(address: string): string {
  return address.length > 26 ? `${address.slice(0, 24)}...` : address;
}

/**
 * The chips under the search bar. From, Sent to and dates are Hostinger search
 * criteria; Has attachment is filtered by our server over the newest matches.
 */
export function FilterChips({
  filters,
  preset,
  senders,
  recipients,
  recipientsLoading,
  recentTo = [],
  onChange,
  onClear,
  phone = false,
}: {
  phone?: boolean;
  /** Addresses this member filtered by lately, offered first. */
  recentTo?: string[];
  filters: MailListFilters;
  preset: string | null;
  senders: string[];
  recipients: MailRecipient[];
  recipientsLoading: boolean;
  onChange: (next: MailListFilters, preset?: string | null) => void;
  onClear: () => void;
}) {
  const f = filters;
  const dated = Boolean(f.since || f.before);
  const row = useRef<HTMLDivElement>(null);
  const applied = [f.from, f.to, f.since, f.before, f.attachment].join("|");
  const counts = new Map(recipients.map((r) => [r.address, r.count]));
  const recent = new Set(recentTo);
  const choices = [
    ...recentTo.map((address) => ({ address, count: counts.get(address) ?? 0 })),
    ...recipients.filter((r) => !recent.has(r.address)),
  ];

  // A narrow row scrolls; bring a chip that was just applied into view so its value shows.
  useEffect(() => {
    const el = row.current;
    const chip = el?.querySelector<HTMLElement>("[data-on]");
    if (!el || !chip) return;
    const right = chip.offsetLeft + chip.offsetWidth + 44;
    if (chip.offsetLeft < el.scrollLeft || right > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: Math.max(0, chip.offsetLeft - 12), behavior: "smooth" });
    }
  }, [applied]);

  return (
    <div ref={row} className="no-scrollbar relative flex items-center gap-2 overflow-x-auto px-3 py-2.5 sm:px-4">
      <Chip
        label={f.from ? `From: ${short(f.from)}` : "From"}
        title="From"
        on={Boolean(f.from)}
        sheet={phone}
        onReset={() => onChange({ ...f, from: undefined })}
      >
        {(close) => (
          <div className="space-y-2">
            <TextApply
              label="Sender"
              focus={!phone}
              initial={f.from ?? ""}
              placeholder="Name or address"
              onApply={(value) => {
                onChange({ ...f, from: value || undefined });
                close();
              }}
            />
            {senders.length > 0 && (
              <div className={phone ? "" : "max-h-56 overflow-y-auto"}>
                {senders.map((s) => (
                  <Option
                    key={s}
                    on={f.from === s}
                    onClick={() => {
                      onChange({ ...f, from: s });
                      close();
                    }}
                  >
                    {s}
                  </Option>
                ))}
              </div>
            )}
            {f.from && (
              <Option
                on={false}
                onClick={() => {
                  onChange({ ...f, from: undefined });
                  close();
                }}
              >
                Anyone
              </Option>
            )}
          </div>
        )}
      </Chip>

      <Chip
        label={rangeLabel(f, preset)}
        title="Date"
        on={dated}
        sheet={phone}
        onReset={() => onChange({ ...f, since: undefined, before: undefined }, null)}
      >
        {(close) => (
          <div className="space-y-2">
            <div>
              <Option
                on={!dated}
                onClick={() => {
                  onChange({ ...f, since: undefined, before: undefined }, null);
                  close();
                }}
              >
                Any time
              </Option>
              {RANGES.map((r) => (
                <Option
                  key={r.id}
                  on={preset === r.id}
                  onClick={() => {
                    onChange({ ...f, since: r.since?.(), before: r.before?.() }, r.id);
                    close();
                  }}
                >
                  {r.label}
                </Option>
              ))}
            </div>
            <CustomRange
              since={f.since ?? ""}
              before={f.before ?? ""}
              onApply={(since, before) => {
                onChange({ ...f, since: since || undefined, before: before || undefined }, null);
                close();
              }}
            />
          </div>
        )}
      </Chip>

      <button
        type="button"
        aria-pressed={f.attachment === "1"}
        onClick={() => onChange({ ...f, attachment: f.attachment ? undefined : "1" })}
        className={`${chipBase} ${f.attachment ? chipOn : chipIdle}`}
      >
        {f.attachment && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        Has attachment
      </button>

      <Chip
        label={f.to ? `Sent to: ${phone ? f.to.split("@")[0] : short(f.to)}` : "Sent to"}
        title="Sent to"
        on={Boolean(f.to)}
        sheet={phone}
        onReset={() => onChange({ ...f, to: undefined })}
      >
        {(close) => (
          <div className="space-y-2">
            <p className="text-[12px] text-slate-600">
              Mail addressed to one address, including Bcc and alias deliveries.
            </p>
            <div className={phone ? "" : "max-h-56 overflow-y-auto"}>
              {recipientsLoading && choices.length === 0 ? (
                <p className="px-2.5 py-2 text-[12.5px] text-slate-550">Reading recent mail</p>
              ) : (
                choices.map((r) => (
                  <Option
                    key={r.address}
                    on={f.to === r.address}
                    onClick={() => {
                      onChange({ ...f, to: r.address });
                      close();
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {recent.has(r.address) ? (
                        <History className="h-3.5 w-3.5 shrink-0 text-slate-550" aria-label="Used lately" />
                      ) : (
                        <AtSign className="h-3.5 w-3.5 shrink-0 text-slate-550" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{r.address}</span>
                      {r.count > 0 && <span className="shrink-0 text-[11.5px] font-normal text-slate-550">{r.count}</span>}
                    </span>
                  </Option>
                ))
              )}
            </div>
            <TextApply
              label="Any address"
              focus={!phone}
              initial={f.to && !choices.some((r) => r.address === f.to) ? f.to : ""}
              placeholder="Another address"
              onApply={(value) => {
                onChange({ ...f, to: value || undefined });
                close();
              }}
            />
            {f.to && (
              <Option
                on={false}
                onClick={() => {
                  onChange({ ...f, to: undefined });
                  close();
                }}
              >
                Any address
              </Option>
            )}
          </div>
        )}
      </Chip>

      {activeFilters(f) && (
        <button
          type="button"
          onClick={onClear}
          className="c-tap inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[12.5px] font-semibold text-wine-700 hover:bg-wine-50"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function CustomRange({
  since,
  before,
  onApply,
}: {
  since: string;
  before: string;
  onApply: (since: string, before: string) => void;
}) {
  const [a, setA] = useState(since);
  const [b, setB] = useState(before);
  return (
    <div className="space-y-2 border-t border-mist-100 pt-2">
      <p className="px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Custom range</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11.5px] text-slate-600">
          On or after
          <input type="date" className={`${inputClass} mt-1`} value={a} onChange={(e) => setA(e.target.value)} />
        </label>
        <label className="block text-[11.5px] text-slate-600">
          Before
          <input type="date" className={`${inputClass} mt-1`} value={b} onChange={(e) => setB(e.target.value)} />
        </label>
      </div>
      <Button size="sm" disabled={a === "" && b === ""} onClick={() => onApply(a, b)}>
        Apply range
      </Button>
    </div>
  );
}

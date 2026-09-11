"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DropdownMenu } from "radix-ui";
import { ArrowDown, ArrowUp, Copy, ImagePlus, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import {
  PROTOTYPES_MAX,
  PROTOTYPE_KINDS,
  PROTOTYPE_KIND_LABELS,
  moneyRefusalMessage,
  newPrototypeId,
  parseMajor,
  plainMajor,
  prototypeLabel,
  type EstatePrototype,
  type PrototypeKind,
} from "@avhomes/contracts";
import { BottomSheet } from "@/components/admin/BottomSheet";
import ImagePicker from "@/components/admin/ImagePicker";
import { Button, ConfirmButton, IconButton } from "@/components/admin/ui";
import { MoneyInput } from "./MoneyInput";
import { NumberInput } from "./NumberInput";

/** One option row as the form holds it: the price is the raw major-unit text. */
export interface PrototypeDraft {
  id: string;
  kind: PrototypeKind;
  name: string;
  bedrooms: number;
  bathrooms: number;
  sizeSqm: number;
  price: string;
  image: string | null;
  available: boolean;
  /** True on a row the form added that nobody has edited since. Such a row is not saved. */
  untouched?: boolean;
}

/**
 * Drops rows Enter added and nobody edited, so a reflexive Enter does not save a
 * phantom 4 bed. Anything typed, picked or toggled keeps it.
 */
export function withoutUntouched(rows: readonly PrototypeDraft[]): PrototypeDraft[] {
  return rows.filter((row) => !(row.untouched && row.name.trim() === "" && row.price.trim() === ""));
}

export function toPrototypeDraft(p: EstatePrototype, currency: string): PrototypeDraft {
  return {
    id: p.id,
    kind: p.kind,
    name: p.name,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    sizeSqm: p.sizeSqm,
    // Unpriced shows as an empty box, not a 0 somebody has to delete.
    price: p.priceMinor > 0 ? plainMajor(p.priceMinor, currency) : "",
    image: p.image,
    available: p.available,
  };
}

/**
 * Rows back to prototypes. An empty price is 0 (unpriced, which the publish
 * check names); a price that does not parse is an issue, and reads as 0 in the
 * live summary so it never throws mid-keystroke.
 */
export function readPrototypes(
  rows: readonly PrototypeDraft[],
  currency: string,
): { prototypes: EstatePrototype[]; issues: { path: string; message: string }[] } {
  const issues: { path: string; message: string }[] = [];
  const prototypes = rows.map((row, index): EstatePrototype => {
    const house = row.kind === "house";
    let priceMinor = 0;
    if (row.price.trim() !== "") {
      const parsed = parseMajor(row.price, currency);
      if (parsed.ok) priceMinor = parsed.minor;
      else
        issues.push({
          path: `prototypes.${index}.price`,
          message: `${prototypeLabel(row)}: ${moneyRefusalMessage(parsed.reason, currency)}`,
        });
    }
    return {
      id: row.id,
      kind: row.kind,
      name: row.name.trim(),
      bedrooms: house ? row.bedrooms : 0,
      bathrooms: house ? row.bathrooms : 0,
      sizeSqm: row.sizeSqm,
      priceMinor,
      image: row.image,
      available: row.available,
    };
  });
  return { prototypes, issues };
}

/** `speculative` marks a row Enter added on its own; a tapped chip is a deliberate choice and is kept. */
function blankRow(kind: PrototypeKind, rooms: number, speculative = false): PrototypeDraft {
  return {
    id: newPrototypeId(),
    kind,
    name: "",
    bedrooms: kind === "house" ? rooms : 0,
    bathrooms: kind === "house" ? rooms : 0,
    sizeSqm: 0,
    price: "",
    image: null,
    available: true,
    ...(speculative ? { untouched: true } : {}),
  };
}

const QUICK_ADD: readonly { label: string; kind: PrototypeKind; rooms: number }[] = [
  { label: "2 bed", kind: "house", rooms: 2 },
  { label: "3 bed", kind: "house", rooms: 3 },
  { label: "4 bed", kind: "house", rooms: 4 },
  { label: "Plot", kind: "plot", rooms: 0 },
];

const ROOMS_MAX = 20;

/* inputClass's tokens, denser once the rows lay out as a table. Not appended to
   inputClass, because Tailwind's sheet order, not the string, decides a
   conflicting pair. */
const CELL =
  "w-full min-w-0 rounded-lg border border-mist-200 bg-white px-3 py-2 text-[13px] text-plum-950 outline-none transition-colors placeholder:text-slate-550 focus:border-wine-500 aria-[invalid=true]:border-red-500 @xl:px-2 @xl:py-1.5 @xl:text-[12px]";
/* The table cells are too narrow to spare room for spinners. */
const NUMBER_CELL = `${CELL} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;
/* The field label: drawn on a row card, read by a screen reader in the table. */
const CELL_LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600 @xl:sr-only";
/* One template for the header and every row, so the columns line up. */
const COLUMNS =
  "@xl:grid-cols-[2rem_4.5rem_minmax(0,1fr)_2.25rem_2.25rem_3.5rem_5.5rem_4.75rem_1.75rem]";

/* The quick-add chips' geometry. "Add option" shares it rather than using
   Button's `sm`, which stays 28px on a phone beside these 36px chips. */
const CHIP_BOX = "c-tap inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed sm:h-7 sm:px-2.5";

/** The row controls focus can be sent to by id. */
type Control = "price" | "name" | "size" | "up" | "down" | "menu";

/* A plot is told apart by its size, a house by its price, so that is where a new row's caret goes. */
const firstControl = (kind: PrototypeKind): Control => (kind === "plot" ? "size" : "price");

/* An id on a wrapper (IconButton takes none) resolves to the button inside it. */
function focusControl(id: string) {
  const el = document.getElementById(id);
  const target = el instanceof HTMLInputElement || el instanceof HTMLButtonElement ? el : el?.querySelector("button");
  if (!target) return;
  target.focus();
  if (target instanceof HTMLInputElement) target.select();
}

/**
 * The estate's options, entered the way Shopify enters variants.
 *
 * A quick-add chip inserts a prefilled row and puts the caret in its price, and
 * Enter in a price moves to the next row's price, or adds the next row when it
 * is the last one and priced, so a run of options is typed without reaching for
 * a mouse. Moving or removing a row keeps focus on the control that did it.
 *
 * ONE SET OF CONTROLS, laid out twice by a CONTAINER query rather than a
 * viewport one. The main column is 440px wide on a 1024px laptop and 620px on a
 * wide one, so the viewport says nothing about whether nine columns fit. Below
 * 36rem of its own width each row is a card with drawn labels; from there up it
 * is a dense table row whose labels are screen-reader only.
 */
export function PrototypeTable({
  rows,
  onChange,
  currency,
  readOnly = false,
}: {
  rows: PrototypeDraft[];
  onChange: (rows: PrototypeDraft[]) => void;
  currency: string;
  /** In the trash. The photo sheet, whose picker uploads, is never mounted. */
  readOnly?: boolean;
}) {
  const uid = useId();
  const pendingFocus = useRef<string | null>(null);
  const full = rows.length >= PROTOTYPES_MAX;

  const controlId = (rowId: string, control: Control) => `${uid}-${rowId}-${control}`;
  const quickId = `${uid}-quick`;

  /* After the render that mounts or moves the row. A frame later, because a
     Radix menu that closed in the same tick restores focus to its trigger first. */
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const frame = requestAnimationFrame(() => focusControl(target));
    return () => cancelAnimationFrame(frame);
  }, [rows]);

  function insert(row: PrototypeDraft, at: number, control: Control) {
    if (full) return;
    pendingFocus.current = controlId(row.id, control);
    onChange([...rows.slice(0, at), row, ...rows.slice(at)]);
  }

  function update(id: string, patch: Partial<PrototypeDraft>) {
    // `undefined` rather than `false`, so a saved row edited and reverted still compares clean.
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch, untouched: undefined } : row)));
  }

  /**
   * Focus follows the row to the same control. When the move disables the
   * pressed arrow (the row reached an end), it goes to the other arrow instead.
   */
  function move(index: number, to: number, via: "up" | "down" | "menu") {
    const row = rows[index];
    if (!row || to < 0 || to >= rows.length) return;
    const next = [...rows];
    next.splice(index, 1);
    next.splice(to, 0, row);
    const control: Control =
      via === "up" && to === 0 ? "down" : via === "down" && to === rows.length - 1 ? "up" : via;
    pendingFocus.current = controlId(row.id, control);
    onChange(next);
  }

  function remove(index: number) {
    const neighbour = rows[index + 1] ?? rows[index - 1];
    pendingFocus.current = neighbour ? controlId(neighbour.id, "price") : quickId;
    onChange(rows.filter((_, i) => i !== index));
  }

  function duplicate(index: number) {
    const source = rows[index];
    if (!source) return;
    insert({ ...source, id: newPrototypeId() }, index + 1, "name");
  }

  /** Enter in a price: the next row's price, or a new row like this one once this one is priced. */
  function priceEnter(index: number) {
    const row = rows[index];
    if (!row) return;
    const next = rows[index + 1];
    if (next) {
      focusControl(controlId(next.id, "price"));
      return;
    }
    if (row.price.trim() === "") return;
    // The next size up is the usual next option: a 2 bed is followed by a 3 bed.
    const rooms = Math.min(ROOMS_MAX, row.bedrooms + 1);
    insert(blankRow(row.kind, rooms, true), rows.length, firstControl(row.kind));
  }

  const chips = (
    <div role="group" aria-label="Add an option" className="flex flex-wrap items-center gap-2">
      {QUICK_ADD.map((q, i) => (
        <button
          key={q.label}
          id={i === 0 ? quickId : undefined}
          type="button"
          disabled={full}
          aria-label={`Add ${q.label.toLowerCase()} option`}
          onClick={() => insert(blankRow(q.kind, q.rooms), rows.length, firstControl(q.kind))}
          className={`${CHIP_BOX} bg-mist-100 text-slate-600 hover:bg-mist-200/70 hover:text-plum-950 disabled:opacity-60`}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {q.label}
        </button>
      ))}
      {/* Button's ghost look (`c-bevel` also brings its disabled plate) on the chip box. */}
      <button
        type="button"
        disabled={full}
        onClick={() => insert(blankRow("house", 0), rows.length, "name")}
        className={`${CHIP_BOX} c-bevel bg-white text-plum-950 hover:bg-mist-50`}
      >
        Add option
      </button>
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-mist-200 bg-mist-50 p-4 sm:p-5">
        <p className="text-[13px] font-semibold text-plum-950">No options yet</p>
        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-slate-600">
          An option is one thing a buyer can pick inside this estate: a house type such as a 3 bedroom
          detached, or a plot size. Each has its own price, and the estate&apos;s &quot;from&quot; price is worked
          out from them.
        </p>
        <div className="mt-3">{chips}</div>
      </div>
    );
  }

  return (
    <div className="@container">
      <div
        aria-hidden="true"
        className={`hidden gap-1.5 border-b border-mist-200 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 @xl:grid ${COLUMNS}`}
      >
        <span />
        <span>Kind</span>
        <span>Name</span>
        <span>Beds</span>
        <span>Baths</span>
        <span>Sqm</span>
        <span>Price</span>
        <span>Available</span>
        <span />
      </div>

      <div className="space-y-3 @xl:space-y-0">
        {rows.map((row, index) => (
          <PrototypeRow
            key={row.id}
            row={row}
            index={index}
            count={rows.length}
            currency={currency}
            controlId={controlId}
            canAdd={!full}
            readOnly={readOnly}
            onUpdate={(patch) => update(row.id, patch)}
            onMove={(to, via) => move(index, to, via)}
            onDuplicate={() => duplicate(index)}
            onRemove={() => remove(index)}
            onPriceEnter={() => priceEnter(index)}
            onFieldEnter={() => focusControl(controlId(row.id, "price"))}
          />
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {chips}
        <p className="text-xs text-slate-600">
          {full
            ? `That is the most one estate can hold (${PROTOTYPES_MAX}).`
            : `Prices in ${currency}. Enter in a price moves to the next one, or adds the next option once the last is priced.`}
        </p>
      </div>
    </div>
  );
}

function PrototypeRow({
  row,
  index,
  count,
  currency,
  controlId,
  canAdd,
  readOnly,
  onUpdate,
  onMove,
  onDuplicate,
  onRemove,
  onPriceEnter,
  onFieldEnter,
}: {
  row: PrototypeDraft;
  index: number;
  count: number;
  currency: string;
  controlId: (rowId: string, control: Control) => string;
  canAdd: boolean;
  readOnly: boolean;
  onUpdate: (patch: Partial<PrototypeDraft>) => void;
  onMove: (to: number, via: "up" | "down" | "menu") => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onPriceEnter: () => void;
  onFieldEnter: () => void;
}) {
  const label = prototypeLabel(row);
  const house = row.kind === "house";
  const priceId = controlId(row.id, "price");
  const priceError =
    row.price.trim() === ""
      ? null
      : (() => {
          const parsed = parseMajor(row.price, currency);
          return parsed.ok ? null : moneyRefusalMessage(parsed.reason, currency);
        })();

  // Enter anywhere else in the row lands in its price, the field typed next.
  const toPrice = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onFieldEnter();
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={`grid grid-cols-6 gap-3 rounded-xl border border-mist-200 p-3 @xl:items-start @xl:gap-1.5 @xl:rounded-none @xl:border-x-0 @xl:border-t-0 @xl:px-0 @xl:py-2 ${COLUMNS}`}
    >
      {/* Source order is the tab order in both layouts. The two wrappers below
          are a line of their own on a card and `contents` in the table, where
          each child is a cell of the row. */}
      <div className="col-span-6 flex items-end gap-3 @xl:contents">
        <PrototypePhoto
          image={row.image}
          label={label}
          readOnly={readOnly}
          onChange={(image) => onUpdate({ image })}
        />
        <label className="min-w-0">
          <span className={CELL_LABEL}>Kind</span>
          <select
            className={CELL}
            value={row.kind}
            onChange={(e) => onUpdate({ kind: e.target.value as PrototypeKind })}
          >
            {PROTOTYPE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {PROTOTYPE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="col-span-6 min-w-0 @xl:col-span-1">
        <span className={CELL_LABEL}>Name</span>
        <input
          id={controlId(row.id, "name")}
          className={CELL}
          autoComplete="off"
          maxLength={120}
          placeholder={prototypeLabel({ ...row, name: "" })}
          value={row.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          onKeyDown={toPrice}
        />
      </label>

      {house ? (
        <>
          <label className="col-span-2 min-w-0 @xl:col-span-1">
            <span className={CELL_LABEL}>Beds</span>
            <NumberInput
              className={NUMBER_CELL}
              min={0}
              max={ROOMS_MAX}
              value={row.bedrooms}
              onChange={(v) => onUpdate({ bedrooms: v ?? 0 })}
              onKeyDown={toPrice}
            />
          </label>
          <label className="col-span-2 min-w-0 @xl:col-span-1">
            <span className={CELL_LABEL}>Baths</span>
            <NumberInput
              className={NUMBER_CELL}
              min={0}
              max={ROOMS_MAX}
              value={row.bathrooms}
              onChange={(v) => onUpdate({ bathrooms: v ?? 0 })}
              onKeyDown={toPrice}
            />
          </label>
        </>
      ) : (
        // Holds the two room columns open in the table so the row lines up.
        <span aria-hidden="true" className="hidden @xl:col-span-2 @xl:block" />
      )}

      <label className={`min-w-0 @xl:col-span-1 ${house ? "col-span-2" : "col-span-6"}`}>
        <span className={CELL_LABEL}>{house ? "Size (sqm)" : "Plot size (sqm)"}</span>
        <NumberInput
          id={controlId(row.id, "size")}
          className={NUMBER_CELL}
          min={0}
          max={10_000_000}
          value={row.sizeSqm}
          onChange={(v) => onUpdate({ sizeSqm: v ?? 0 })}
          onKeyDown={toPrice}
        />
      </label>

      <div className="col-span-6 min-w-0 @xl:col-span-1">
        <label htmlFor={priceId} className={CELL_LABEL}>
          Price ({currency})
        </label>
        <MoneyInput
          id={priceId}
          className={CELL}
          placeholder="0"
          aria-invalid={priceError !== null}
          aria-describedby={priceError ? `${priceId}-error` : undefined}
          value={row.price}
          onChange={(raw) => onUpdate({ price: raw })}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            onPriceEnter();
          }}
        />
        {priceError && (
          <p id={`${priceId}-error`} className="mt-1 text-[11px] leading-snug text-red-700">
            {priceError}
          </p>
        )}
      </div>

      <div className="col-span-6 flex flex-wrap items-center gap-2 @xl:contents">
        {/* The console's checkbox switch, as on "Feature on the landing page".
            The table's column header carries the word, so there it is sr-only. */}
        <label className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 text-[13px] font-semibold text-plum-950 active:bg-mist-100 @xl:mx-0 @xl:min-h-8 @xl:px-0 @xl:active:bg-transparent">
          <input
            type="checkbox"
            className="h-5 w-5 shrink-0 accent-[var(--wine-600)] @xl:h-4 @xl:w-4"
            checked={row.available}
            onChange={(e) => onUpdate({ available: e.target.checked })}
          />
          <span className="@xl:sr-only">Available</span>
        </label>

        {/* Visible buttons on a card, where there is room for them and a menu
            is one more tap under a thumb. The wrappers carry the ids focus is
            sent to after a move, since IconButton takes none. */}
        <div className="ml-auto flex items-center gap-2 @xl:hidden">
          <span id={controlId(row.id, "up")} className="contents">
            <IconButton
              label={`Move ${label} up`}
              icon={ArrowUp}
              disabled={index === 0}
              onClick={() => onMove(index - 1, "up")}
            />
          </span>
          <span id={controlId(row.id, "down")} className="contents">
            <IconButton
              label={`Move ${label} down`}
              icon={ArrowDown}
              disabled={index === count - 1}
              onClick={() => onMove(index + 1, "down")}
            />
          </span>
          <IconButton label={`Duplicate ${label}`} icon={Copy} disabled={!canAdd} onClick={onDuplicate} />
          <ConfirmButton confirmLabel="Yes, remove" onConfirm={onRemove}>
            Remove
          </ConfirmButton>
        </div>

        {/* The id is here, not on the trigger, whose own id labels the menu. */}
        <div id={controlId(row.id, "menu")} className="hidden @xl:block">
          <RowMenu
            label={label}
            first={index === 0}
            last={index === count - 1}
            canAdd={canAdd}
            onMove={(delta) => onMove(index + delta, "menu")}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
          />
        </div>
      </div>
    </div>
  );
}

const MENU_ITEM =
  "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-plum-950 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-mist-100";

/** The table row's secondary actions. A menu, because nine columns leave no room for four buttons. */
function RowMenu({
  label,
  first,
  last,
  canAdd,
  onMove,
  onDuplicate,
  onRemove,
}: {
  label: string;
  first: boolean;
  last: boolean;
  canAdd: boolean;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`More for ${label}`}
        title={`More for ${label}`}
        // Radix opens on pointerdown and reads only its own `disabled`, so a
        // disabled fieldset around the form would not stop it.
        onPointerDown={(e) => {
          if (e.currentTarget.matches(":disabled")) e.preventDefault();
        }}
        className="grid h-8 w-7 place-items-center rounded-lg text-slate-550 transition-colors hover:bg-mist-100 hover:text-plum-950 data-[state=open]:bg-mist-100 data-[state=open]:text-plum-950"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="console-float z-[72] w-48 overflow-hidden rounded-xl border border-mist-200 bg-white p-1.5 shadow-pop"
        >
          <DropdownMenu.Item disabled={first} onSelect={() => onMove(-1)} className={MENU_ITEM}>
            <ArrowUp className="h-4 w-4 text-slate-550" aria-hidden />
            Move up
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={last} onSelect={() => onMove(1)} className={MENU_ITEM}>
            <ArrowDown className="h-4 w-4 text-slate-550" aria-hidden />
            Move down
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={!canAdd} onSelect={onDuplicate} className={MENU_ITEM}>
            <Copy className="h-4 w-4 text-slate-550" aria-hidden />
            Duplicate
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1.5 h-px bg-mist-200" />
          {/* No confirm here: opening the menu is the first of two deliberate
              clicks, and Discard in the save bar brings the row back. */}
          <DropdownMenu.Item onSelect={onRemove} className={`${MENU_ITEM} text-red-700`}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Remove
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * One photo per option: a thumbnail that opens the real ImagePicker, held to
 * one image, in a sheet. The same upload path and library as the gallery.
 */
function PrototypePhoto({
  image,
  label,
  readOnly,
  onChange,
}: {
  image: string | null;
  label: string;
  readOnly: boolean;
  onChange: (image: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const [seen, setSeen] = useState(image);
  if (seen !== image) {
    setSeen(image);
    setBroken(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={image ? `Change the photo for ${label}` : `Add a photo for ${label}`}
        title={image ? "Change photo" : "Add photo"}
        className={`c-tap grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg @xl:h-8 @xl:w-8 ${
          image && !broken
            ? "bg-mist-100"
            : "border-2 border-dashed border-mist-200 bg-mist-50 text-slate-550 hover:border-wine-500 hover:text-wine-600"
        }`}
      >
        {image && !broken ? (
          // A plain img, as in ImagePicker: API paths today, arbitrary CDN hosts later.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : (
          <ImagePlus className="h-4 w-4" aria-hidden />
        )}
      </button>

      {/* The sheet portals out of the form's disabled fieldset, so in the
          trash it is not mounted at all rather than trusted to stay shut. */}
      {!readOnly && (
        <BottomSheet
          open={open}
          onOpenChange={setOpen}
          title={`Photo for ${label}`}
          description="One render or photo. Without one, the estate's main photo is shown."
          footer={
            <div className="flex justify-end">
              <Button className="w-full sm:w-auto" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          }
        >
          <ImagePicker
            value={image ? [image] : []}
            max={1}
            coverLabel="Photo"
            onChange={(urls) => onChange(urls[0] ?? null)}
          />
        </BottomSheet>
      )}
    </>
  );
}

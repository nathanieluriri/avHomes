"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Building2 } from "lucide-react";
import {
  PROPERTY_TYPES,
  parseMajor,
  plainMajor,
  moneyRefusalMessage,
  statusLabel,
  type Property,
  type PropertyType,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { SaveBar } from "@/components/admin/SaveBar";
import { fullDate } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import ImagePicker from "@/components/admin/ImagePicker";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  DRow,
  DefinitionList,
  ErrorNote,
  Field,
  PageHeader,
  Skeleton,
  inputClass,
} from "@/components/admin/ui";

/**
 * The listing editor.
 *
 * Two rules the server enforces and this screen therefore obeys:
 *
 *  - `slug` and `status` are SERVER-AUTHORITATIVE. The slug is displayed and
 *    never edited; status moves only through the lifecycle buttons, each of
 *    which answers with the new listing so the form adopts the bumped revision.
 *  - Every save carries the `baseRevision` the form was LOADED with. A lost race
 *    comes back as a 409 carrying the other person's version, so the choice
 *    below is a real choice rather than a silent overwrite.
 */

type Draft = {
  title: string;
  tagline: string;
  description: string;
  price: string;
  currency: string;
  type: PropertyType;
  location: string;
  city: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  areaSqft: number;
  parkingSpaces: number;
  yearBuilt: number;
  featured: boolean;
  amenities: string;
  images: string[];
};

function toDraft(p: Property): Draft {
  return {
    title: p.title,
    tagline: p.tagline,
    description: p.description,
    price: plainMajor(p.priceMinor, p.currency),
    currency: p.currency,
    type: p.type,
    location: p.location,
    city: p.city,
    address: p.address,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    areaSqft: p.areaSqft,
    parkingSpaces: p.parkingSpaces,
    yearBuilt: p.yearBuilt,
    featured: p.featured,
    amenities: p.amenities.join("\n"),
    images: p.images,
  };
}

/**
 * The editor's shape, so the wait does not reflow into it.
 *
 * The same thirds grid and the same aside-first order as the editor itself,
 * because a skeleton that stacks the other way round is a reflow dressed up as
 * a loading state: the phone would shimmer a tall form block and then replace it
 * with the status panel.
 */
function EditorSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only">Loading this listing</span>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="order-2 min-w-0 space-y-6 lg:order-none lg:col-span-2">
          <Skeleton className="h-56 rounded-2xl sm:h-64" />
          {/* Below `lg` the aside is already two blocks deep before this one
              starts, so the second placeholder is off the fold and only shimmers
              at somebody scrolling for it. */}
          <Skeleton className="hidden h-80 rounded-2xl lg:block" />
        </div>
        <div className="order-1 min-w-0 space-y-6 lg:order-none">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

const LIFECYCLE: readonly { op: string; label: string; when: (p: Property) => boolean }[] = [
  {
    op: "publish",
    label: "Publish",
    // Out of the trash first. `transitionProperty` has no deletedAt guard.
    when: (p) => p.deletedAt === null && (p.status === "draft" || p.status === "archived"),
  },
  {
    op: "unpublish",
    label: "Unpublish",
    when: (p) => p.deletedAt === null && (p.status === "for-sale" || p.status === "for-rent"),
  },
  { op: "archive", label: "Archive", when: (p) => p.status !== "archived" && p.deletedAt === null },
  /* No `restore` here. A listing can only be restored out of the trash, and
     while it is in the trash the banner at the top of the screen carries that
     button. Listing it here too drew the same control twice, once inside the
     sentence explaining the block and once in a card below it. */
];

export default function PropertyEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, loading, reload } = useAsync<{ property: Property }>(
    (signal) => api.get<{ property: Property }>(`/admin/properties/${id}`, signal),
    [id],
  );

  /*
   * Both branches KEEP THE HEADER. A screen that fails to load and shows only a
   * red box has also thrown away the breadcrumb, which is the way back, and the
   * rise then animates an empty sheet. The layout of a detail screen is known
   * before its data is, so the wait shows that layout.
   */
  if (loading) {
    return (
      <>
        <PageHeader icon={Building2} backTo="/admin/properties" backLabel="Listings" title="Listing" />
        <EditorSkeleton />
      </>
    );
  }
  if (error) {
    return (
      <>
        <PageHeader icon={Building2} backTo="/admin/properties" backLabel="Listings" title="Listing" />
        <ErrorNote error={error} onRetry={reload} />
      </>
    );
  }
  if (!data) return null;

  /*
   * REMOUNTED BY KEY rather than synced by an effect.
   *
   * The editor seeds its form state from this listing once, at mount. Keying on
   * the id means navigating to a different listing builds a fresh component with
   * fresh state, which is React'''s own answer to "reset when the input changes"
   * and avoids an effect that would briefly render one listing'''s data under
   * another'''s heading.
   */
  return <PropertyEditor key={data.property.id} initial={data.property} />;
}

function PropertyEditor({ initial }: { initial: Property }) {
  const router = useRouter();
  const [property, setProperty] = useState<Property>(initial);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initial));
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  /*
   * Dirty is derived, never tracked. A boolean set by every field handler drifts
   * the first time somebody types a character and deletes it again, and then the
   * save bar and the unload prompt start disagreeing with each other about
   * whether anything is at stake. Comparing the draft against the listing it was
   * seeded from cannot drift.
   */
  /* A trashed record cannot be patched at all, so nothing here is savable and
     the save bar must not claim otherwise. */
  const trashed = property.deletedAt !== null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(property));

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setSaveError(null);

    const money = parseMajor(draft.price, draft.currency);
    if (!money.ok) {
      setSaveError(
        new ApiError(400, {
          error: "bad_request",
          detail: moneyRefusalMessage(money.reason, draft.currency),
          issues: [{ path: "price", message: money.reason }],
        }),
      );
      setBusy(false);
      return;
    }

    try {
      const res = await api.patch<{ property: Property }>(`/admin/properties/${property.id}`, {
        patch: {
          title: draft.title,
          tagline: draft.tagline,
          description: draft.description,
          priceMinor: money.minor,
          currency: draft.currency,
          type: draft.type,
          location: draft.location,
          city: draft.city,
          address: draft.address,
          bedrooms: draft.bedrooms,
          bathrooms: draft.bathrooms,
          areaSqft: draft.areaSqft,
          parkingSpaces: draft.parkingSpaces,
          yearBuilt: draft.yearBuilt,
          featured: draft.featured,
          amenities: splitLines(draft.amenities),
          images: draft.images,
        },
        baseRevision: property.revision,
      });
      setProperty(res.property);
      setDraft(toDraft(res.property));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function transition(op: string) {
    setBusy(true);
    setSaveError(null);
    try {
      /*
       * NO FORM RE-SEED HERE, and that is the point.
       *
       * A lifecycle op writes `status`, `publishedAt`, `slug` and `deletedAt`
       * and touches no field on this form. Re-seeding from its response could
       * therefore only ever do one of two things: overwrite the form with the
       * values it already held, or throw away edits the operator had not saved.
       * It did the second, silently, and the save bar disappeared in the same
       * tick, so the screen reported itself clean immediately after losing the
       * work. A body edit was unrecoverable, because remounting the editor takes
       * its undo stack with it.
       *
       * Adopting the record is still right: it carries the new status and the
       * bumped revision the next save has to quote.
       */
      const res = await api.post<{ property: Property }>(`/admin/properties/${property.id}/${op}`);
      setProperty(res.property);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  async function trash() {
    setBusy(true);
    try {
      await api.del(`/admin/properties/${property.id}?baseRevision=${property.revision}`);
      router.push("/admin/properties");
    } catch (err) {
      setSaveError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
      setBusy(false);
    }
  }

  /** The 409 body carries the other person's full listing, so this needs no refetch. */
  const theirs =
    saveError?.body.error === "stale_write" ? (saveError.body.property as Property | undefined) : undefined;

  return (
    <>
      {/* `backTo` draws the breadcrumb, which replaces the old "Back" link in
          the action row. The crumb says where you are AND takes you up, and it
          sits where a reader looks for that rather than beside Save. */}
      <SaveBar
        when={dirty && !trashed}
        saving={busy}
        onDiscard={() => {
          setDraft(toDraft(property));
          setSaveError(null);
        }}
        onSave={() => void save()}
      />

      <PageHeader
        icon={Building2}
        backTo="/admin/properties"
        backLabel="Listings"
        title={property.title || "Untitled listing"}
        badge={
          <Badge tone={property.deletedAt ? "red" : "wine"}>
            {property.deletedAt ? "In trash" : statusLabel(property.status)}
          </Badge>
        }
        subtitle={property.slug ? `/listings/${property.slug}` : "No slug yet. It is derived when you publish."}
        /* NO SAVE IN THE HEADER. Saving belongs to the bar, which appears the
           moment there is anything to save and follows the work down the page.
           A permanently greyed-out Save up here is a control that has never
           once been pressable: it teaches the reader to look in the wrong
           place, and then does nothing when they do. */
      />

      {trashed && (
        /* The server refuses a patch to a trashed record (`deletedAt: null` is
           in the update filter), so the form cannot be saved and the console
           says so instead of offering a Save that comes back 409.

           RESTORE IS IN THE BANNER, not named by position. The copy used to send
           the reader to "the panel on the right", which below `lg` is a panel
           that does not exist: the status card is stacked with everything else.
           The one control that unblocks this screen now sits inside the sentence
           that says the screen is blocked. */
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          <p className="font-semibold">This is in the trash</p>
          <p className="mt-1">
            Nothing here can be saved while it is. Restore it and the form comes back.
          </p>
          <Button
            variant="ghost"
            className="mt-3 w-full sm:w-auto"
            disabled={busy}
            onClick={() => transition("restore")}
          >
            Restore
          </Button>
        </div>
      )}

      {saveError && (
        <div className="mb-4">
          <ErrorNote error={saveError} />
          {theirs && (
            /* Stacked below `sm`. The sentence is the one thing on this screen
               that has to be read before choosing, and beside a shrink-proof
               button at 360px it was compressed into a four-line ribbon. */
            <div className="mt-2 flex flex-col items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm sm:flex-row sm:items-center sm:gap-3">
              <span className="text-amber-900">
                Their version is revision {theirs.revision}, titled {theirs.title || "Untitled"}.
              </span>
              <Button
                variant="ghost"
                className="w-full sm:w-auto"
                onClick={() => {
                  setProperty(theirs);
                  setDraft(toDraft(theirs));
                  setSaveError(null);
                }}
              >
                Load theirs
              </Button>
            </div>
          )}
        </div>
      )}

      {/* The aside comes FIRST on a phone and takes the right-hand third
          from `lg` up, because it is not a footnote here. It holds the
          status chip, the lifecycle moves and the featured switch, and
          stacked in source order all of them landed after a six-field
          location card, five number fields, the amenities box and a
          forty-photo gallery. Changing a listing's status is the most common
          thing done on this screen and it was the last thing on it. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="order-2 min-w-0 space-y-6 lg:order-none lg:col-span-2">
          <Card className="space-y-4">
            <Field label="Title">
              <input className={inputClass} value={draft.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
            <Field label="Tagline">
              <input className={inputClass} value={draft.tagline} onChange={(e) => set("tagline", e.target.value)} />
            </Field>
            <Field label="Description">
              <textarea
                className={`${inputClass} min-h-40`}
                value={draft.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </Card>

          <Card className="grid gap-4 sm:grid-cols-2">
            <Field label="Price" hint={`In ${draft.currency}, major units. Stored as minor units.`}>
              {/* `decimal` rather than `numeric`: a price is the one field here
                  that carries a separator, and the digits-only keypad has no key
                  for it. Autocomplete off, because what a browser has saved for a
                  bare text box is somebody's address, not a price. */}
              <input
                className={inputClass}
                inputMode="decimal"
                autoComplete="off"
                value={draft.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>
            <Field label="Currency">
              <input
                className={inputClass}
                maxLength={3}
                autoComplete="off"
                autoCapitalize="characters"
                value={draft.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Type">
              <select
                className={inputClass}
                value={draft.type}
                onChange={(e) => set("type", e.target.value as PropertyType)}
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="City">
              <input
                className={inputClass}
                autoComplete="address-level2"
                value={draft.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </Field>
            <Field label="Location">
              <input className={inputClass} value={draft.location} onChange={(e) => set("location", e.target.value)} />
            </Field>
            <Field label="Address">
              <input
                className={inputClass}
                autoComplete="street-address"
                value={draft.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
          </Card>

          <Card className="grid gap-4 sm:grid-cols-3">
            <NumberField label="Bedrooms" value={draft.bedrooms} onChange={(v) => set("bedrooms", v)} />
            <NumberField label="Bathrooms" value={draft.bathrooms} onChange={(v) => set("bathrooms", v)} />
            <NumberField label="Parking" value={draft.parkingSpaces} onChange={(v) => set("parkingSpaces", v)} />
            <NumberField label="Area (sqft)" value={draft.areaSqft} onChange={(v) => set("areaSqft", v)} />
            <NumberField label="Year built" value={draft.yearBuilt} onChange={(v) => set("yearBuilt", v)} />
          </Card>

          <Card className="space-y-4">
            <Field label="Amenities" hint="One per line.">
              <textarea
                className={`${inputClass} min-h-32`}
                value={draft.amenities}
                onChange={(e) => set("amenities", e.target.value)}
              />
            </Field>
            {/* `as="group"`, not a label. ImagePicker owns a hidden file input,
                and a bare label forwards a tap on any of its own whitespace to
                the first labelable descendant, so a short scroll that starts on
                the gallery opened the camera roll. */}
            <Field
              label="Photos"
              hint="The first one leads the listing card and the gallery."
              as="group"
            >
              <ImagePicker
                value={draft.images}
                onChange={(images) => set("images", images)}
                coverLabel="Main photo"
              />
            </Field>
          </Card>
        </div>

        <div className="order-1 min-w-0 space-y-6 lg:order-none">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <Badge tone={property.deletedAt ? "red" : "wine"}>
                {property.deletedAt ? "In trash" : statusLabel(property.status)}
              </Badge>
            </div>
            {/* A stacked full-width grid below `sm`, a wrapping chip row from
                there up. These are the moves that decide what the public site
                shows, and two of them take a live listing off the market: at
                32px with 8px between them, on a surface the reader is also
                scrolling, Unpublish and Archive are one thumb apart. */}
            <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
              {LIFECYCLE.filter((l) => l.when(property)).map((l) => (
                <Button
                  key={l.op}
                  variant="ghost"
                  className="w-full sm:w-auto"
                  disabled={busy}
                  onClick={() => transition(l.op)}
                >
                  {l.label}
                </Button>
              ))}
            </div>
            {/* A real row below `sm`, not a 16px box beside a line of text: this
                is the control that decides what the landing page shows, and with
                a thumb its whole target was the height of one line of 14px type.
                The negative margin keeps that row optically flush with the card.
                Everything about it is undone from `sm` up, because with a mouse
                the dense line is right and a 44px block with its own margins
                would sit in the aside disagreeing with every row around it. */}
            <label className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-plum-950 active:bg-mist-100 sm:mx-0 sm:min-h-0 sm:gap-2 sm:px-0 sm:pt-2">
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[var(--wine-600)] sm:h-auto sm:w-auto"
                checked={draft.featured}
                onChange={(e) => set("featured", e.target.checked)}
              />
              Feature on the landing page
            </label>
          </Card>

          <Card>
            <DefinitionList>
              <DRow label="Revision">{property.revision}</DRow>
              <DRow label="Created">{fullDate(property.createdAt)}</DRow>
              <DRow label="Updated">{fullDate(property.updatedAt)}</DRow>
              <DRow label="Published">
                {property.publishedAt ? fullDate(property.publishedAt) : "Not yet"}
              </DRow>
              <DRow label="Agent">{property.agent.name || "Unassigned"}</DRow>
            </DefinitionList>
          </Card>

          {property.deletedAt === null && (
            <Card>
              <p className="text-xs text-muted-foreground">
                Moving a listing to the trash is reversible. There is no permanent delete, because an
                enquiry may name this property.
              </p>
              {/* Two taps. The aside comes FIRST on a phone now, so this
                  full-bleed destructive control sits high on the screen and in
                  the thumb arc rather than at the far bottom of the page. */}
              <ConfirmButton
                className="mt-3 w-full"
                confirmLabel="Yes, move to trash"
                disabled={busy}
                onConfirm={trash}
              >
                Move to trash
              </ConfirmButton>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/**
 * A number in the draft, and a STRING on screen.
 *
 * Rendering `value={value}` and writing back `Number(text) || 0` meant clearing
 * the box put a literal 0 in it under the caret, so every edit started by
 * deleting a zero somebody never typed. With a mouse that is hidden by
 * select-all; on a phone, where clearing means backspacing to empty and there is
 * no cheap select-all, it happened on all five spec fields every time.
 *
 * So the box holds the raw text and the draft holds the number. An empty box
 * stays empty and the draft carries 0, which is what the server would store for
 * a blank anyway.
 *
 * The parent still owns the value: a save response, a discard or "Load theirs"
 * all reset the draft, and this adopts that DURING RENDER, the way `useAsync`
 * resets for a changed input. The guard is what stops it fighting the typist:
 * a value that already agrees with the text on screen came FROM this box, and
 * rewriting it would turn "05" into "5" mid-keystroke.
 */
function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [raw, setRaw] = useState(String(value));
  const [seen, setSeen] = useState(value);

  if (seen !== value) {
    setSeen(value);
    if (Number(raw) !== value) setRaw(String(value));
  }

  return (
    <Field label={label}>
      <input
        className={inputClass}
        type="number"
        inputMode="numeric"
        autoComplete="off"
        value={raw}
        /* A wheel over a focused number input scrolls the value instead of the
           page, which rewrote a bedroom count on the way past it. Blurring on
           the wheel stops that without taking the spinners away: they are a
           mouse affordance and this console has always drawn them. */
        onWheel={(e) => e.currentTarget.blur()}
        onChange={(e) => {
          setRaw(e.target.value);
          onChange(e.target.value === "" ? 0 : Number(e.target.value) || 0);
        }}
      />
    </Field>
  );
}

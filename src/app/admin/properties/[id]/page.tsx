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

/** The editor's shape, so the wait does not reflow into it. */
function EditorSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]" aria-busy="true">
      <span className="sr-only">Loading this listing</span>
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-44 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    </div>
  );
}

const LIFECYCLE: readonly { op: string; label: string; when: (p: Property) => boolean }[] = [
  { op: "publish", label: "Publish", when: (p) => p.status === "draft" || p.status === "archived" },
  { op: "unpublish", label: "Unpublish", when: (p) => p.status === "for-sale" || p.status === "for-rent" },
  { op: "archive", label: "Archive", when: (p) => p.status !== "archived" && p.deletedAt === null },
  { op: "restore", label: "Restore from trash", when: (p) => p.deletedAt !== null },
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
  const [saved, setSaved] = useState(false);

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
    setSaved(false);
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
      setSaved(true);
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
      const res = await api.post<{ property: Property }>(`/admin/properties/${property.id}/${op}`);
      setProperty(res.property);
      setDraft(toDraft(res.property));
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
          <Badge tone={property.deletedAt ? "red" : "blue"}>
            {property.deletedAt ? "In trash" : statusLabel(property.status)}
          </Badge>
        }
        subtitle={property.slug ? `/listings/${property.slug}` : "No slug yet. It is derived when you publish."}
        /*
         * One Save at a time. While the bar is up it owns the act, and a second
         * live Save in the header is two controls competing for the same click.
         * Clean, the header keeps a disabled Save so the affordance does not
         * disappear from the place a reader looks for it first.
         */
        actions={
          dirty || trashed ? undefined : (
            <Button onClick={save} disabled size="lg">
              {saved ? "Saved" : "Save"}
            </Button>
          )
        }
      />

      {trashed && (
        /* The server refuses a patch to a trashed record (`deletedAt: null` is
           in the update filter), so the form cannot be saved and the console
           says so instead of offering a Save that comes back 409. Restore is
           the one move that still works, and it is in the rail. */
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          <p className="font-semibold">This is in the trash</p>
          <p className="mt-1">
            Nothing here can be saved while it is. Restore it first, from the panel on the
            right, and the form comes back.
          </p>
        </div>
      )}

      {saveError && (
        <div className="mb-4">
          <ErrorNote error={saveError} />
          {theirs && (
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
              <span className="text-amber-900">
                Their version is revision {theirs.revision}, titled {theirs.title || "Untitled"}.
              </span>
              <Button
                variant="ghost"
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
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
              <input className={inputClass} value={draft.price} onChange={(e) => set("price", e.target.value)} />
            </Field>
            <Field label="Currency">
              <input
                className={inputClass}
                maxLength={3}
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
              <input className={inputClass} value={draft.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Location">
              <input className={inputClass} value={draft.location} onChange={(e) => set("location", e.target.value)} />
            </Field>
            <Field label="Address">
              <input className={inputClass} value={draft.address} onChange={(e) => set("address", e.target.value)} />
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
            <Field label="Photos" hint="The first one leads the listing card and the gallery.">
              <ImagePicker
                value={draft.images}
                onChange={(images) => set("images", images)}
                coverLabel="Main photo"
              />
            </Field>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</span>
              <Badge tone={property.deletedAt ? "red" : "blue"}>
                {property.deletedAt ? "In trash" : statusLabel(property.status)}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {LIFECYCLE.filter((l) => l.when(property)).map((l) => (
                <Button key={l.op} variant="ghost" disabled={busy} onClick={() => transition(l.op)}>
                  {l.label}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 pt-2 text-sm text-navy-950">
              <input
                type="checkbox"
                checked={draft.featured}
                onChange={(e) => set("featured", e.target.checked)}
              />
              Feature on the landing page
            </label>
          </Card>

          <Card className="space-y-2 text-sm">
            <Row label="Revision" value={String(property.revision)} />
            <Row label="Created" value={fullDate(property.createdAt)} />
            <Row label="Updated" value={fullDate(property.updatedAt)} />
            <Row
              label="Published"
              value={property.publishedAt ? fullDate(property.publishedAt) : "Not yet"}
            />
            <Row label="Agent" value={property.agent.name || "Unassigned"} />
          </Card>

          {property.deletedAt === null && (
            <Card>
              <p className="text-xs text-muted-foreground">
                Moving a listing to the trash is reversible. There is no permanent delete, because an
                enquiry may name this property.
              </p>
              <Button variant="danger" className="mt-3 w-full" disabled={busy} onClick={trash}>
                Move to trash
              </Button>
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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <input
        className={inputClass}
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-navy-950">{value}</span>
    </div>
  );
}

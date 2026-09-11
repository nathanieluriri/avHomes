"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState } from "react";
import { Building2 } from "lucide-react";
import {
  BUILD_STAGES,
  BUILD_STAGE_LABELS,
  ESTATE_AMENITY_SUGGESTIONS,
  FEE_KINDS_FOR,
  HOME_AMENITY_SUGGESTIONS,
  LISTING_TYPES,
  PROPERTY_TYPES,
  RENT_PERIODS,
  TITLE_DOCUMENTS,
  TITLE_DOCUMENT_LABELS,
  canFeature,
  derivedEstateColumns,
  estateSummary,
  fieldsFor,
  formatPrice,
  formatPriceShort,
  formatSqm,
  isEstate,
  listingPublishBlockers,
  minStayUnit,
  moneyRefusalMessage,
  moveInTotalMinor,
  parseMajor,
  plainMajor,
  prototypeLabel,
  sqftToSqm,
  sqmToSqft,
  statusLabel,
  type BuildStage,
  type EstatePrototype,
  type EstateSummary,
  type FeeKind,
  type ListingFee,
  type ListingType,
  type Property,
  type PropertyType,
  type RentPeriod,
  type TitleDocument,
} from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { SaveBar } from "@/components/admin/SaveBar";
import { historySentence } from "@/lib/admin/audit";
import { fullDate, relative, shortDate } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import ImagePicker from "@/components/admin/ImagePicker";
import { AmenityPicker } from "@/components/admin/listing/AmenityPicker";
import { NumberField } from "@/components/admin/listing/NumberInput";
import { MoneyInput } from "@/components/admin/listing/MoneyInput";
import { ListingPreview } from "@/components/admin/listing/ListingPreview";
import {
  PaymentPlanFields,
  toPaymentPlanDraft,
  type PaymentPlanDraft,
} from "@/components/admin/listing/PaymentPlanFields";
import {
  PrototypeTable,
  readPrototypes,
  toPrototypeDraft,
  withoutUntouched,
  type PrototypeDraft,
} from "@/components/admin/listing/PrototypeTable";
import {
  RentTerms,
  availableFromToDate,
  dateToAvailableFrom,
  type RentTermsDraft,
} from "@/components/admin/listing/RentTerms";
import { Segmented } from "@/components/admin/listing/Segmented";
import {
  Badge,
  Button,
  Card,
  CardHead,
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
 *
 * `fieldsFor` decides which sections exist. A field it rules out is hidden AND
 * sent cleared, so the form never shows or saves something the listing's type
 * cannot carry.
 */

const FEE_KIND_LABELS: Record<FeeKind, string> = {
  agency: "Agency fee",
  legal: "Legal fee",
  caution: "Caution deposit",
  "service-charge": "Service charge",
};

const PERIOD_OPTION_LABELS: Record<RentPeriod, string> = {
  year: "Per year",
  month: "Per month",
  night: "Per night",
};

const DEAL_OPTIONS = LISTING_TYPES.map((t) => ({ value: t, label: t === "sale" ? "Sale" : "Rent" }));

/** The kinds a sale cannot carry, for the notice under the fee rows. */
const RENT_ONLY_FEE_KINDS: readonly FeeKind[] = FEE_KINDS_FOR.rent.filter(
  (kind) => !FEE_KINDS_FOR.sale.includes(kind),
);

/** Field's label, for a block that labels text rather than a control. */
const LABEL = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600";

type Draft = {
  title: string;
  tagline: string;
  description: string;
  price: string;
  currency: string;
  /** Held even on an estate, which is always saved as a sale, so switching the type back keeps it. */
  listingType: ListingType;
  /** Held even on a sale, so switching back to Rent does not forget the choice. */
  rentPeriod: RentPeriod;
  /** One raw amount per fee kind, in major units, same idiom as `price`. */
  fees: Record<FeeKind, string>;
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
  amenities: string[];
  images: string[];
  prototypes: PrototypeDraft[];
  paymentPlan: PaymentPlanDraft;
  buildStage: BuildStage | null;
  titleDocument: TitleDocument | null;
  rentTerms: RentTermsDraft;
};

/**
 * The History panel's own reader, not `AuditEntry`.
 *
 * `GET /admin/properties/:id/history` is a second, narrower endpoint rather
 * than a filtered read of `/admin/audit`: agents hold `listings` on this
 * screen, not `danger`, so the full reader 403s for exactly the role the
 * panel is for. These three fields are the whole answer to "what happened to
 * this house", and none of them is personal data belonging to anyone but a
 * colleague's own name.
 */
interface HistoryLine {
  at: number;
  actorName: string;
  action: string;
}

/** Every fee kind gets a key, so a row never reads a fee that has not been typed yet as `undefined`. */
function toFeeDraft(fees: readonly ListingFee[]): Record<FeeKind, string> {
  const draft: Record<FeeKind, string> = { agency: "", legal: "", caution: "", "service-charge": "" };
  for (const fee of fees) draft[fee.kind] = plainMajor(fee.amountMinor, fee.currency);
  return draft;
}

function toDraft(p: Property): Draft {
  return {
    title: p.title,
    tagline: p.tagline,
    description: p.description,
    price: plainMajor(p.priceMinor, p.currency),
    currency: p.currency,
    listingType: p.listingType,
    // A sale carries no period. Defaulted rather than left null, so the select
    // has a real value ready the moment the operator switches to Rent.
    rentPeriod: p.rentPeriod ?? "year",
    fees: toFeeDraft(p.fees),
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
    amenities: p.amenities,
    images: p.images,
    prototypes: p.prototypes.map((prototype) => toPrototypeDraft(prototype, p.currency)),
    paymentPlan: toPaymentPlanDraft(p.paymentPlan),
    buildStage: p.buildStage,
    titleDocument: p.titleDocument,
    rentTerms: {
      furnishing: p.furnishing,
      serviced: p.serviced,
      availableFrom: availableFromToDate(p.availableFrom),
      minStay: p.minStay,
    },
  };
}

/**
 * The draft as the site would receive it, for the preview. Lenient where save is
 * strict: an amount that does not parse reads as unpriced rather than blocking.
 */
function draftToProperty(saved: Property, d: Draft): Property {
  const fields = fieldsFor({ type: d.type, listingType: d.listingType });
  const listingType: ListingType = fields.dealChoice ? d.listingType : "sale";
  const minor = (raw: string) => {
    const parsed = parseMajor(raw, d.currency);
    return parsed.ok ? parsed.minor : 0;
  };
  const prototypes = fields.prototypes
    ? readPrototypes(withoutUntouched(d.prototypes), d.currency).prototypes
    : [];
  const derived = fields.prototypes ? derivedEstateColumns(prototypes) : null;
  const plan = d.paymentPlan;
  return {
    ...saved,
    title: d.title,
    tagline: d.tagline,
    description: d.description,
    currency: d.currency,
    priceMinor: derived ? derived.priceMinor : minor(d.price),
    listingType,
    rentPeriod: fields.rentPeriod ? d.rentPeriod : null,
    fees: FEE_KINDS_FOR[listingType].flatMap((kind) =>
      d.fees[kind].trim() === "" ? [] : [{ kind, amountMinor: minor(d.fees[kind]), currency: d.currency }],
    ),
    type: d.type,
    location: d.location,
    city: d.city,
    address: d.address,
    bedrooms: derived ? derived.bedrooms : d.bedrooms,
    bathrooms: derived ? derived.bathrooms : d.bathrooms,
    areaSqft: d.areaSqft,
    parkingSpaces: d.parkingSpaces,
    yearBuilt: d.yearBuilt,
    amenities: d.amenities,
    images: d.images,
    prototypes,
    paymentPlan:
      fields.paymentPlan && plan.on
        ? { depositPercent: plan.depositPercent, months: plan.months, note: plan.note.trim() }
        : null,
    buildStage: fields.buildStage ? d.buildStage : null,
    titleDocument: fields.titleDocument ? d.titleDocument : null,
    furnishing: fields.rentTerms ? d.rentTerms.furnishing : null,
    serviced: fields.rentTerms ? d.rentTerms.serviced : false,
    availableFrom: fields.rentTerms ? dateToAvailableFrom(d.rentTerms.availableFrom) : null,
    minStay: fields.rentTerms ? d.rentTerms.minStay : null,
  };
}

/** "From ₦25M · 3 options · 2 to 4 bed", the estate's price as its options decide it. */
function estatePriceLine(s: EstateSummary, currency: string): string {
  if (s.count === 0) return "No options yet";
  const parts: string[] = [];
  if (s.fromMinor > 0) {
    parts.push(`From ${formatPriceShort(s.fromMinor, { listingType: "sale", rentPeriod: null, currency })}`);
  }
  parts.push(`${s.count} ${s.count === 1 ? "option" : "options"}`);
  if (s.bedroomsMax > 0) {
    // A house row added blank has 0 beds; it is not the smallest option.
    const min = s.bedroomsMin > 0 ? s.bedroomsMin : s.bedroomsMax;
    parts.push(min === s.bedroomsMax ? `${min} bed` : `${min} to ${s.bedroomsMax} bed`);
  }
  if (s.plotSqmMin > 0) parts.push(`plots from ${formatSqm(s.plotSqmMin)}`);
  if (s.soldOut) parts.push("sold out");
  return parts.join(" · ");
}

/** The cheapest priced option a buyer can still pick, else the cheapest priced one. */
function cheapestOption(prototypes: readonly EstatePrototype[]): EstatePrototype | null {
  const priced = prototypes.filter((p) => p.priceMinor > 0);
  const pool = priced.some((p) => p.available) ? priced.filter((p) => p.available) : priced;
  return pool.reduce<EstatePrototype | null>(
    (best, p) => (best === null || p.priceMinor < best.priceMinor ? p : best),
    null,
  );
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
    // Mirrors the server's allowed-from table, which refuses publish from the trash.
    when: (p) => p.deletedAt === null && (p.status === "draft" || p.status === "archived"),
  },
  {
    op: "markOffer",
    label: "Mark under offer",
    // An estate sells option by option; its options carry the sold out state.
    when: (p) => p.status === "live" && !isEstate(p.type),
  },
  {
    // Under offer and closed both need a way back to live, or a collapsed deal
    // forces an agent to lie about the listing's state.
    op: "relist",
    label: "Back on the market",
    when: (p) => p.status === "under-offer" || p.status === "closed",
  },
  {
    op: "close",
    label: "Mark closed",
    when: (p) => (p.status === "live" || p.status === "under-offer") && !isEstate(p.type),
  },
  {
    op: "unpublish",
    label: "Unpublish",
    when: (p) => p.deletedAt === null && (p.status === "live" || p.status === "under-offer"),
  },
  { op: "archive", label: "Archive", when: (p) => p.status !== "archived" && p.deletedAt === null },
  { op: "unarchive", label: "Back to draft", when: (p) => p.status === "archived" && p.deletedAt === null },
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
  // The form stays mounted while previewing, so nothing typed is lost by looking.
  const [previewing, setPreviewing] = useState(false);

  // A failed load leaves `history.data` null, and the panel below stays
  // absent rather than showing an error box for what is a secondary,
  // read-only surface on a screen whose own save flow already has one.
  const history = useAsync<{ items: HistoryLine[] }>(
    (signal) => api.get<{ items: HistoryLine[] }>(`/admin/properties/${property.id}/history`, signal),
    [property.id],
  );

  /*
   * Read off `property`, the SAVED record, not `draft`.
   *
   * The server checks what is stored, so checking the draft here would enable
   * Publish the moment somebody typed a price and then hand them a refusal from
   * the API for a value they can see on their own screen. Save first, publish
   * second, and the save bar above already says so.
   */
  const publishBlockers = listingPublishBlockers(property);

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

  // The server refuses a currency change once there is a price history.
  const currencyLocked = property.priceHistory.length > 0;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function setFee(kind: FeeKind, value: string) {
    setDraft((d) => ({ ...d, fees: { ...d.fees, [kind]: value } }));
  }

  /*
   * The type drives the form. An estate has no Sale/Rent choice of its own, so
   * everything below reads `dealType`, never `draft.listingType`, which may
   * still hold the Rent a switch to Estate Land left behind.
   */
  const fields = fieldsFor({ type: draft.type, listingType: draft.listingType });
  const dealType: ListingType = fields.dealChoice ? draft.listingType : "sale";

  /*
   * Recalculated live, straight from the draft, on every render: nothing here
   * is state of its own to fall out of sync. A row left empty contributes
   * nothing rather than parsing as zero, matching the rule the fee inputs
   * themselves follow.
   */
  const liveFees: ListingFee[] = FEE_KINDS_FOR[dealType].flatMap((kind) => {
    const raw = draft.fees[kind].trim();
    if (raw === "") return [];
    const parsed = parseMajor(raw, draft.currency);
    return parsed.ok ? [{ kind, amountMinor: parsed.minor, currency: draft.currency }] : [];
  });
  const livePrice = parseMajor(draft.price, draft.currency);
  const moveIn = moveInTotalMinor({
    priceMinor: livePrice.ok ? livePrice.minor : 0,
    currency: draft.currency,
    listingType: dealType,
    fees: liveFees,
  });
  // A value typed in before the switch to Sale is still sitting in
  // `draft.fees`, just off screen. This is true only while that is so.
  // TODO(verify): the Sale/Rent toggle hides rent fields without losing typed
  // values before save. Needs a browser.
  const hasHiddenFeeValues =
    dealType === "sale" && RENT_ONLY_FEE_KINDS.some((kind) => draft.fees[kind].trim() !== "");

  const liveOptions = readPrototypes(draft.prototypes, draft.currency).prototypes;
  const cheapest = cheapestOption(liveOptions);

  // The same idea as the fee notice, for whole sections a type or deal switch hid.
  const hiddenNotice = [
    !fields.prototypes &&
      (draft.prototypes.length > 0 || draft.paymentPlan.on || draft.buildStage !== null) &&
      "Estate options, the payment plan and the build stage are only saved for Estate Land.",
    !fields.rentTerms &&
      (draft.rentTerms.furnishing !== null ||
        draft.rentTerms.serviced ||
        draft.rentTerms.availableFrom !== "" ||
        draft.rentTerms.minStay !== null) &&
      "Rent terms are not saved for a sale.",
    !fields.titleDocument && draft.titleDocument !== null && "The title document is not saved for a rent.",
  ]
    .filter(Boolean)
    .join(" ");

  function refuse(detail: string, issues: { path: string; message: string }[]) {
    setSaveError(new ApiError(400, { error: "bad_request", detail, issues }));
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    setSaveError(null);

    // An estate's price is derived from its options on the server.
    let priceMinor: number | undefined;
    if (fields.price) {
      const money = parseMajor(draft.price, draft.currency);
      if (!money.ok) {
        refuse(moneyRefusalMessage(money.reason, draft.currency), [{ path: "price", message: money.reason }]);
        return;
      }
      priceMinor = money.minor;
    }

    // Only the kinds this listing type can carry are sent. A caution deposit
    // typed in before a switch to Sale stays in `draft.fees` but never reaches
    // the request: this is the "dropped on save" the pricing card warns about,
    // made true rather than just claimed.
    const feeIssues: { path: string; message: string }[] = [];
    const fees: { kind: FeeKind; amount: string }[] = [];
    for (const kind of FEE_KINDS_FOR[dealType]) {
      const raw = draft.fees[kind].trim();
      if (raw === "") continue; // Empty means the fee does not apply, not zero.
      const parsed = parseMajor(raw, draft.currency);
      if (!parsed.ok) {
        feeIssues.push({ path: `fees.${kind}`, message: moneyRefusalMessage(parsed.reason, draft.currency) });
        continue;
      }
      fees.push({ kind, amount: raw });
    }
    if (feeIssues.length > 0) {
      refuse("Fix the fee amounts before saving.", feeIssues);
      return;
    }

    let prototypes: EstatePrototype[] = [];
    if (fields.prototypes) {
      const read = readPrototypes(withoutUntouched(draft.prototypes), draft.currency);
      if (read.issues.length > 0) {
        refuse("Fix the option prices before saving.", read.issues);
        return;
      }
      prototypes = read.prototypes;
    }

    const plan = draft.paymentPlan;

    try {
      const res = await api.patch<{ property: Property }>(`/admin/properties/${property.id}`, {
        patch: {
          title: draft.title,
          tagline: draft.tagline,
          description: draft.description,
          ...(priceMinor !== undefined && { priceMinor }),
          currency: draft.currency,
          listingType: dealType,
          // A sale cannot carry a period; the server refuses anything else.
          rentPeriod: fields.rentPeriod ? draft.rentPeriod : null,
          fees,
          type: draft.type,
          location: draft.location,
          city: draft.city,
          address: draft.address,
          // An estate's bedrooms and bathrooms are derived too, and it has no
          // parking, area or year built of its own, so those keep what is stored.
          ...(fields.rooms && {
            bedrooms: draft.bedrooms,
            bathrooms: draft.bathrooms,
            parkingSpaces: draft.parkingSpaces,
          }),
          ...(fields.area && { areaSqft: draft.areaSqft }),
          ...(fields.yearBuilt && { yearBuilt: draft.yearBuilt }),
          // Only while the switch is on screen. The server refuses featuring a
          // listing that is not live or under offer.
          ...(canFeature(property) && { featured: draft.featured }),
          amenities: draft.amenities,
          images: draft.images,
          prototypes,
          paymentPlan:
            fields.paymentPlan && plan.on
              ? { depositPercent: plan.depositPercent, months: plan.months, note: plan.note.trim() }
              : null,
          buildStage: fields.buildStage ? draft.buildStage : null,
          titleDocument: fields.titleDocument ? draft.titleDocument : null,
          furnishing: fields.rentTerms ? draft.rentTerms.furnishing : null,
          serviced: fields.rentTerms ? draft.rentTerms.serviced : false,
          availableFrom: fields.rentTerms ? dateToAvailableFrom(draft.rentTerms.availableFrom) : null,
          minStay: fields.rentTerms ? draft.rentTerms.minStay : null,
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

  // Ctrl/Cmd+S saves exactly when the save bar would, and never offers the browser's own save.
  const runKeyedSave = useEffectEvent(() => {
    if (dirty && !trashed && !busy) void save();
  });
  const onSaveKey = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "s") return;
    e.preventDefault();
    // Blur first so fields that commit on blur (a clamped number, a typed
    // amenity) reach the draft, then save a task later, once that has rendered.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setTimeout(() => runKeyedSave(), 0);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onSaveKey(e);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function transition(op: string) {
    setBusy(true);
    setSaveError(null);
    try {
      /*
       * NO FORM RE-SEED HERE, and that is the point.
       *
       * A lifecycle op writes `status`, `publishedAt`, `slug` and `deletedAt`
       * and touches no field on this form but `featured`. Re-seeding from its
       * response could therefore only ever do one of two things: overwrite the
       * form with the values it already held, or throw away edits the operator
       * had not saved. It did the second, silently, and the save bar disappeared
       * in the same tick, so the screen reported itself clean immediately after
       * losing the work. A body edit was unrecoverable, because remounting the
       * editor takes its undo stack with it.
       *
       * Adopting the record is still right: it carries the new status and the
       * bumped revision the next save has to quote.
       */
      const res = await api.post<{ property: Property }>(`/admin/properties/${property.id}/${op}`);
      setProperty(res.property);
      // Leaving live or under offer clears `featured` on the server. Adopt that
      // one field, or its now hidden switch would hold the form dirty.
      if (!canFeature(res.property)) set("featured", res.property.featured);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
    }
  }

  /*
   * The refusal is shown AT THE BUTTON, not only at the top of the page.
   *
   * This wrote to `saveError`, which renders in the header block. The trash
   * control is the last thing in the aside, so on a desk a 409 scrolled a
   * screen and a half out of view: the button disarmed, nothing moved, and the
   * listing was still there. That is indistinguishable from a dead button, and
   * it is what a QA pass reported it as.
   *
   * A stale revision is the likely refusal and the one worth naming. It means
   * somebody else changed this listing since the page loaded, and the fix is a
   * reload rather than a retry, which a generic "something went wrong" does not
   * tell anybody.
   */
  const [trashError, setTrashError] = useState<string | null>(null);

  async function trash() {
    setBusy(true);
    setTrashError(null);
    try {
      await api.del(`/admin/properties/${property.id}?baseRevision=${property.revision}`);
      router.push("/admin/properties");
    } catch (err) {
      const stale = err instanceof ApiError && err.body.error === "stale_write";
      setTrashError(
        stale
          ? "This listing changed since you opened it, so it was not moved. Reload and try again."
          : err instanceof ApiError
            ? `It was not moved: ${err.body.error}.`
            : "It was not moved. Check your connection and try again.",
      );
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
        subtitle={
          property.slug
            ? `/listings/${property.slug} · fixed at publish, so shared links keep working`
            : "No web address yet. It is made from the title when you publish, and does not change afterwards."
        }
        actions={
          <div role="group" aria-label="Edit or preview" className="inline-flex rounded-lg bg-mist-100 p-0.5">
            {([false, true] as const).map((mode) => (
              <button
                key={String(mode)}
                type="button"
                aria-pressed={previewing === mode}
                onClick={() => setPreviewing(mode)}
                className={`c-tap h-10 rounded-md px-4 text-[13px] font-semibold transition-colors sm:h-8 ${
                  previewing === mode
                    ? "bg-white text-plum-950 shadow-card"
                    : "text-slate-600 hover:text-plum-950"
                }`}
              >
                {mode ? "Preview" : "Edit"}
              </button>
            ))}
          </div>
        }
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
      {previewing && <ListingPreview property={draftToProperty(property, draft)} />}

      <div hidden={previewing} className="grid gap-6 lg:grid-cols-3">
        {/* READ-ONLY IN THE TRASH. A disabled fieldset disables its form
            controls and nothing else: the gallery's tile drag and file drop are
            div and li handlers it never reaches, and that drop really uploads.
            So in the trash the gallery is drawn as plain thumbnails and the
            option photo sheet is not mounted, and nothing here can write. */}
        <fieldset
          disabled={trashed}
          className="order-2 min-w-0 space-y-6 lg:order-none lg:col-span-2"
        >
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

          {/* TODO(verify): the admin editor's new sections match the Shopify
              bar's section rhythm rather than reading as an appended block.
              Needs a browser and a human eye. */}
          <Card className="space-y-4">
            {/* Type first, because it decides what the rest of the form asks. */}
            <div className="grid gap-4 sm:grid-cols-2">
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
              {fields.dealChoice ? (
                /* `as="group"`: this wraps two buttons, not one input, so a bare
                   label would forward a click on its own whitespace to the first
                   one. Named "Sale or rent" rather than "Type", which already
                   means Villa or Duplex in the select beside it. */
                <Field label="Sale or rent" as="group">
                  <Segmented options={DEAL_OPTIONS} value={draft.listingType} onChange={(t) => set("listingType", t)} />
                </Field>
              ) : (
                <div>
                  <span className={LABEL}>Sale or rent</span>
                  <p className="py-2 text-[13px] text-slate-600">Always a sale. An estate is sold, not let.</p>
                </div>
              )}
            </div>

            {hiddenNotice && <p className="text-xs text-amber-700">{hiddenNotice}</p>}

            <div className="grid gap-4 sm:grid-cols-2">
              {fields.price ? (
                <Field label="Price" hint={`In ${draft.currency}, major units. Stored as minor units.`}>
                  <MoneyInput value={draft.price} onChange={(raw) => set("price", raw)} />
                </Field>
              ) : (
                <div>
                  <span className={LABEL}>Price</span>
                  <p className="rounded-lg bg-mist-50 px-3 py-2 text-[13px] font-semibold text-plum-950">
                    {estatePriceLine(estateSummary(liveOptions), draft.currency)}
                  </p>
                  <span className="mt-1 block text-xs text-slate-600">Worked out from the options below.</span>
                </div>
              )}
              <Field
                label="Currency"
                hint={currencyLocked ? "Locked once the price has changed, so the history stays in one currency." : undefined}
              >
                <input
                  className={inputClass}
                  maxLength={3}
                  autoComplete="off"
                  autoCapitalize="characters"
                  disabled={currencyLocked}
                  value={draft.currency}
                  onChange={(e) => set("currency", e.target.value.toUpperCase())}
                />
              </Field>
              {fields.rentPeriod && (
                <div className="sm:col-span-2">
                  <Field label="Period">
                    <select
                      className={inputClass}
                      value={draft.rentPeriod}
                      onChange={(e) => {
                        const period = e.target.value as RentPeriod;
                        // Months and nights are different units, so a minimum stay does not carry across.
                        setDraft((d) => ({
                          ...d,
                          rentPeriod: period,
                          rentTerms:
                            minStayUnit(period) === minStayUnit(d.rentPeriod)
                              ? d.rentTerms
                              : { ...d.rentTerms, minStay: null },
                        }));
                      }}
                    >
                      {RENT_PERIODS.map((period) => (
                        <option key={period} value={period}>
                          {PERIOD_OPTION_LABELS[period]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              {fields.buildStage && (
                <Field label="Build stage">
                  <select
                    className={inputClass}
                    value={draft.buildStage ?? ""}
                    onChange={(e) => set("buildStage", e.target.value === "" ? null : (e.target.value as BuildStage))}
                  >
                    <option value="">Not stated</option>
                    {BUILD_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {BUILD_STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {fields.titleDocument && (
                <Field label="Title document">
                  <select
                    className={inputClass}
                    value={draft.titleDocument ?? ""}
                    onChange={(e) =>
                      set("titleDocument", e.target.value === "" ? null : (e.target.value as TitleDocument))
                    }
                  >
                    <option value="">Not stated</option>
                    {TITLE_DOCUMENTS.map((doc) => (
                      <option key={doc} value={doc}>
                        {TITLE_DOCUMENT_LABELS[doc]}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <div className="space-y-3 border-t border-mist-200 pt-4">
              <span className={LABEL}>Fees</span>
              <div className="grid gap-4 sm:grid-cols-2">
                {FEE_KINDS_FOR[dealType].map((kind) => (
                  <Field key={kind} label={FEE_KIND_LABELS[kind]} hint="Leave blank if it doesn't apply.">
                    <MoneyInput placeholder="0" value={draft.fees[kind]} onChange={(raw) => setFee(kind, raw)} />
                  </Field>
                ))}
              </div>

              {hasHiddenFeeValues && (
                <p className="text-xs text-amber-700">Rent-only fees are not saved for a sale.</p>
              )}

              {dealType === "rent" && (
                <div className="flex items-center justify-between gap-4 rounded-lg bg-mist-50 px-3 py-2.5">
                  <span className="text-[13px] font-semibold text-plum-950">Total to move in</span>
                  <span className="text-[13px] font-bold text-plum-950">
                    {formatPrice(moveIn.minor, { listingType: "rent", rentPeriod: null, currency: draft.currency })}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {fields.prototypes && (
            <Card>
              <CardHead title="Options" />
              <PrototypeTable
                rows={draft.prototypes}
                onChange={(rows) => set("prototypes", rows)}
                currency={draft.currency}
                readOnly={trashed}
              />
              <div className="mt-4 border-t border-mist-200 pt-4">
                <PaymentPlanFields
                  value={draft.paymentPlan}
                  onChange={(patch) => setDraft((d) => ({ ...d, paymentPlan: { ...d.paymentPlan, ...patch } }))}
                  example={cheapest && { label: prototypeLabel(cheapest), priceMinor: cheapest.priceMinor }}
                  currency={draft.currency}
                />
              </div>
            </Card>
          )}

          {fields.rentTerms && (
            <Card>
              <CardHead title="Rent terms" />
              <RentTerms
                value={draft.rentTerms}
                rentPeriod={draft.rentPeriod}
                onChange={(patch) => setDraft((d) => ({ ...d, rentTerms: { ...d.rentTerms, ...patch } }))}
              />
            </Card>
          )}

          {/* Collapsed to nothing when there is none, rather than a table shell
              with a header row and no body: a price that has never changed is
              the common case, not an edge case to apologise for. */}
          {property.priceHistory.length > 0 && (
            <Card className="space-y-3">
              <CardHead title="Price history" />
              {[...property.priceHistory].reverse().map((change, index) => (
                <div key={`${change.at}-${index}`} className="rounded-xl border border-mist-200 p-3">
                  <p className="text-[13px]">
                    <span className="text-slate-600">
                      {formatPrice(change.fromMinor, {
                        listingType: property.listingType,
                        rentPeriod: null,
                        currency: change.currency,
                      })}
                    </span>
                    <span className="mx-1.5 text-mist-300" aria-hidden="true">
                      →
                    </span>
                    <span className="font-semibold text-plum-950">
                      {formatPrice(change.toMinor, {
                        listingType: property.listingType,
                        rentPeriod: null,
                        currency: change.currency,
                      })}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {shortDate(change.at)} · {change.byName || "Unknown"}
                  </p>
                </div>
              ))}
            </Card>
          )}

          <Card className="grid gap-4 sm:grid-cols-2">
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
            <div className="sm:col-span-2">
              <Field label="Address">
                <input
                  className={inputClass}
                  autoComplete="street-address"
                  value={draft.address}
                  onChange={(e) => set("address", e.target.value)}
                />
              </Field>
            </div>
          </Card>

          {(fields.rooms || fields.area || fields.yearBuilt) && (
            <Card className="grid gap-4 sm:grid-cols-3">
              {fields.rooms && (
                <>
                  <NumberField label="Bedrooms" value={draft.bedrooms} onChange={(v) => set("bedrooms", v)} />
                  <NumberField label="Bathrooms" value={draft.bathrooms} onChange={(v) => set("bathrooms", v)} />
                  <NumberField label="Parking" value={draft.parkingSpaces} onChange={(v) => set("parkingSpaces", v)} />
                </>
              )}
              {fields.area && (
                <NumberField
                  label="Area (sqm)"
                  value={sqftToSqm(draft.areaSqft)}
                  onChange={(v) => set("areaSqft", sqmToSqft(v))}
                />
              )}
              {fields.yearBuilt && (
                <NumberField label="Year built" value={draft.yearBuilt} onChange={(v) => set("yearBuilt", v)} />
              )}
            </Card>
          )}

          <Card className="space-y-4">
            <AmenityPicker
              value={draft.amenities}
              onChange={(amenities) => set("amenities", amenities)}
              suggestions={isEstate(draft.type) ? ESTATE_AMENITY_SUGGESTIONS : HOME_AMENITY_SUGGESTIONS}
            />
            {/* `as="group"`, not a label. ImagePicker owns a hidden file input,
                and a bare label forwards a tap on any of its own whitespace to
                the first labelable descendant, so a short scroll that starts on
                the gallery opened the camera roll. */}
            {trashed ? (
              <Field label="Photos" as="group">
                {draft.images.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {draft.images.map((url, index) => (
                      <li key={`${url}-${index}`} className="overflow-hidden rounded-lg border border-mist-200 bg-white">
                        {/* A plain img, as in ImagePicker. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt=""
                          className="aspect-[4/3] w-full bg-mist-100 object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-slate-600">No photos.</p>
                )}
              </Field>
            ) : (
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
            )}
          </Card>
        </fieldset>

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
                scrolling, Unpublish and Archive are one thumb apart.

                None in the trash, where the banner's Restore is the only move. */}
            {!trashed && (
              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                {LIFECYCLE.filter((l) => l.when(property)).map((l) => (
                  <Button
                    key={l.op}
                    variant="ghost"
                    className="w-full sm:w-auto"
                    disabled={busy || (l.op === "publish" && publishBlockers.length > 0)}
                    onClick={() => transition(l.op)}
                  >
                    {l.label}
                  </Button>
                ))}
              </div>
            )}

            {/* DISABLED AND EXPLAINED, never hidden. A Publish button that is
                simply absent reads as a bug, and the reader is left guessing
                which of a dozen fields the screen is unhappy about. */}
            {!trashed &&
              publishBlockers.length > 0 &&
              LIFECYCLE.some((l) => l.op === "publish" && l.when(property)) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-[12px] font-semibold text-amber-900">
                    Not ready to publish
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {publishBlockers.map((b) => (
                      <li
                        key={b.field}
                        className="flex items-start gap-2 text-[12px] leading-relaxed text-amber-900/90"
                      >
                        <span
                          className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-700"
                          aria-hidden="true"
                        />
                        {b.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            {/* ONLY WHERE IT CAN APPLY, read off the SAVED record. The server
                refuses to feature anything that is not live or under offer, so
                a switch on a draft or a sold house is a control that cannot do
                anything. A draft gets one line saying when it will; closed,
                archived and trashed listings get nothing.

                A real row below `sm`, not a 16px box beside a line of text: this
                is the control that decides what the landing page shows, and with
                a thumb its whole target was the height of one line of 14px type.
                The negative margin keeps that row optically flush with the card.
                Everything about it is undone from `sm` up, because with a mouse
                the dense line is right and a 44px block with its own margins
                would sit in the aside disagreeing with every row around it. */}
            {canFeature(property) ? (
              <label className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-plum-950 active:bg-mist-100 sm:mx-0 sm:min-h-0 sm:gap-2 sm:px-0 sm:pt-2">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[var(--wine-600)] sm:h-auto sm:w-auto"
                  checked={draft.featured}
                  onChange={(e) => set("featured", e.target.checked)}
                />
                Feature on the landing page
              </label>
            ) : !trashed && property.status === "draft" ? (
              <p className="text-[12px] text-slate-600">Featuring becomes available once it is live.</p>
            ) : (
              canFeature({ status: property.status, deletedAt: property.deletedAt }) && (
                <p className="text-[12px] text-slate-600">
                  Every option is sold out, so it cannot be featured on the landing page.
                </p>
              )
            )}
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

          {!trashed && (
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
              {trashError && (
                <p role="alert" className="mt-2 text-[12px] leading-relaxed text-red-700">
                  {trashError}
                </p>
              )}
            </Card>
          )}

          {/* Collapsed to nothing while loading, on a failed fetch, and when
              the listing has no history yet, the same rule "Price history"
              above follows: a shell with a heading and no rows is not a
              lighter version of this panel, it is a panel with nothing to
              say. */}
          {history.data && history.data.items.length > 0 && (
            <Card className="space-y-3">
              <CardHead title="History" />
              <ul className="space-y-3">
                {history.data.items.map((line, index) => (
                  <li key={`${line.at}-${index}`} className="text-[13px]">
                    <p className="text-plum-950">{historySentence(line.actorName, line.action)}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{relative(line.at)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

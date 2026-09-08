"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import LocationInput from "@/components/LocationInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPES = [
  "Villa",
  "Apartment",
  "Duplex",
  "Penthouse",
  "Townhouse",
  "Terrace",
  "Bungalow",
  "Studio",
  "Mansion",
];

const ANY = "any";

/**
 * The bar STAGES a search; it does not run one as you type.
 *
 * That is deliberate (four controls, one navigation, no request per keystroke)
 * and it was also the bug: picking "For Rent" changed a dropdown and nothing
 * else, so the list underneath went on showing the old results with no hint
 * that a press was owed. People read that as a broken filter, because from the
 * outside it is indistinguishable from one.
 *
 * So the bar now says what it is holding. `pending` compares the controls
 * against the URL that produced the list on screen, which is the only honest
 * definition of "not applied yet": it stays true after a reload, it goes false
 * the moment the navigation lands, and it cannot drift the way a dirty flag set
 * by each handler does.
 */
export default function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();

  const applied = {
    q: params.get("q") ?? "",
    status: params.get("status") ?? ANY,
    type: params.get("type") ?? ANY,
    beds: params.get("beds") ?? ANY,
  };

  const [q, setQ] = useState(applied.q);
  const [status, setStatus] = useState(applied.status);
  const [type, setType] = useState(applied.type);
  const [beds, setBeds] = useState(applied.beds);

  const hasFilters =
    Boolean(params.get("q")) ||
    Boolean(params.get("status")) ||
    Boolean(params.get("type")) ||
    Boolean(params.get("beds"));

  /* Trimmed on the `q` comparison only, so trailing whitespace somebody has not
     finished typing does not count as a change they need to act on. */
  const pending =
    q.trim() !== applied.q ||
    status !== applied.status ||
    type !== applied.type ||
    beds !== applied.beds;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (status !== ANY) next.set("status", status);
    if (type !== ANY) next.set("type", type);
    if (beds !== ANY) next.set("beds", beds);
    const qs = next.toString();
    router.push(`/listings${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function reset() {
    setQ("");
    setStatus(ANY);
    setType(ANY);
    setBeds(ANY);
    router.push("/listings", { scroll: false });
  }

  return (
    <form onSubmit={submit}>
      <div
        className={`rounded-2xl border bg-white p-3 transition-colors lg:rounded-full lg:p-2.5 ${
          pending ? "border-wine-500" : "border-mist-200"
        }`}
      >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-0">
        <LocationInput
          value={q}
          onChange={setQ}
          placeholder="Search location..."
          wrapperClassName="flex flex-1 items-center gap-2.5 px-4 py-2.5"
        />

        <div className="hidden h-8 w-px shrink-0 bg-mist-200 lg:block" />

        <div className="px-1 lg:px-1.5">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger
              aria-label="Status"
              className="w-full rounded-full border-0 bg-mist-100 text-sm lg:w-[132px] lg:bg-transparent"
            >
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any status</SelectItem>
              <SelectItem value="For Sale">For Sale</SelectItem>
              <SelectItem value="For Rent">For Rent</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="hidden h-8 w-px shrink-0 bg-mist-200 lg:block" />

        <div className="px-1 lg:px-1.5">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger
              aria-label="Property type"
              className="w-full rounded-full border-0 bg-mist-100 text-sm lg:w-[140px] lg:bg-transparent"
            >
              <SelectValue placeholder="Any type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any type</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden h-8 w-px shrink-0 bg-mist-200 lg:block" />

        <div className="px-1 lg:px-1.5">
          <Select value={beds} onValueChange={setBeds}>
            <SelectTrigger
              aria-label="Minimum bedrooms"
              className="w-full rounded-full border-0 bg-mist-100 text-sm lg:w-[118px] lg:bg-transparent"
            >
              <SelectValue placeholder="Any beds" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any beds</SelectItem>
              {[1, 2, 3, 4, 5].map((b) => (
                <SelectItem key={b} value={String(b)}>
                  {b}+ beds
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 lg:pl-1">
          {hasFilters && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-plum-950"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.2} />
              Reset
            </button>
          )}
          <button
            type="submit"
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 lg:flex-none lg:py-3 ${
              pending ? "ring-2 ring-wine-600/30 ring-offset-2" : ""
            }`}
          >
            <Search className="h-4 w-4" strokeWidth={2.2} />
            Search
          </button>
        </div>
      </div>
      </div>

      {/*
        `aria-live="polite"`, so the change is announced rather than only drawn.
        This message exists BECAUSE the visual state of the controls is not
        enough on its own, and a reader who cannot see the ring is exactly the
        one who needs telling that a press is owed.

        The wrapper is always in the tree and only its CONTENT is conditional.
        A live region that is added to the DOM at the same moment it gains text
        is not announced by most screen readers: it has to be there, and empty,
        first.
      */}
      <div aria-live="polite" className="min-h-[1.5rem] px-1 pt-2">
        {pending && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-wine-700">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-wine-600" aria-hidden="true" />
            {countPending(applied, { q: q.trim(), status, type, beds })} not applied yet. Press
            Search to see the results.
          </p>
        )}
      </div>
    </form>
  );
}

/**
 * "2 changes" rather than "changes", because the number is what tells somebody
 * they also moved a control they have forgotten about.
 */
function countPending(
  applied: { q: string; status: string; type: string; beds: string },
  staged: { q: string; status: string; type: string; beds: string },
): string {
  const n = (["q", "status", "type", "beds"] as const).filter(
    (key) => applied[key] !== staged[key],
  ).length;
  return n === 1 ? "1 change" : `${n} changes`;
}

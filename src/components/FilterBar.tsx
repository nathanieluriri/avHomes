"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, MapPin, X } from "lucide-react";
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

export default function FilterBar() {
  const router = useRouter();
  const params = useSearchParams();

  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? ANY);
  const [type, setType] = useState(params.get("type") ?? ANY);
  const [beds, setBeds] = useState(params.get("beds") ?? ANY);

  const hasFilters =
    Boolean(params.get("q")) ||
    Boolean(params.get("status")) ||
    Boolean(params.get("type")) ||
    Boolean(params.get("beds"));

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
    <form
      onSubmit={submit}
      className="rounded-2xl border border-mist-200 bg-white p-3 lg:rounded-full lg:p-2.5"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-0">
        <div className="flex flex-1 items-center gap-2.5 px-4 py-2.5">
          <MapPin className="h-4 w-4 shrink-0 text-blue-600" strokeWidth={1.8} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search location..."
            aria-label="Search by location"
            className="w-full bg-transparent text-sm text-navy-950 outline-none placeholder:text-slate-500"
          />
        </div>

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
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-navy-950"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.2} />
              Reset
            </button>
          )}
          <button
            type="submit"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 lg:flex-none lg:py-3"
          >
            <Search className="h-4 w-4" strokeWidth={2.2} />
            Search
          </button>
        </div>
      </div>
    </form>
  );
}

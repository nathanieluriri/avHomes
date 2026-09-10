"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import LocationInput from "@/components/LocationInput";
import { ESTATE_TYPE, type PropertyType } from "@/lib/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Estates first, as in the category chips. The value is the stored type, the label what a buyer calls it.
const TYPES: { value: PropertyType; label: string }[] = [
  { value: ESTATE_TYPE, label: "Estates" },
  { value: "Villa", label: "Villa" },
  { value: "Apartment", label: "Apartment" },
  { value: "Duplex", label: "Duplex" },
  { value: "Penthouse", label: "Penthouse" },
  { value: "Townhouse", label: "Townhouse" },
  { value: "Terrace", label: "Terrace" },
  { value: "Bungalow", label: "Bungalow" },
  { value: "Studio", label: "Studio" },
  { value: "Mansion", label: "Mansion" },
];

/**
 * Floating search card. The wrapper pulls it up so it straddles the hero and
 * the section beneath, matching the AV Constructions layout.
 */
export default function SearchStrip() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    const qs = params.toString();
    router.push(`/listings${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="relative z-30 -mt-24 px-6 lg:px-10">
      <form
        onSubmit={submit}
        className="mx-auto flex max-w-5xl flex-col gap-3 rounded-2xl border border-mist-200 bg-white p-3 lg:flex-row lg:items-center lg:gap-0 lg:rounded-full lg:p-2.5"
      >
        <LocationInput value={q} onChange={setQ} placeholder="Search in location..." />

        <div className="hidden h-8 w-px bg-mist-200 lg:block" />

        <div className="px-1 lg:px-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger
              aria-label="Buy or rent"
              className="w-full rounded-full border-0 bg-mist-100 text-sm shadow-none lg:w-[140px] lg:bg-transparent"
            >
              <SelectValue placeholder="Buy or Rent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="For Sale">Buy</SelectItem>
              <SelectItem value="For Rent">Rent</SelectItem>
              <SelectItem value="Under Offer">Under Offer</SelectItem>
              <SelectItem value="Let Agreed">Let Agreed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="hidden h-8 w-px bg-mist-200 lg:block" />

        <div className="px-1 lg:px-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger
              aria-label="Property type"
              className="w-full rounded-full border-0 bg-mist-100 text-sm shadow-none lg:w-[150px] lg:bg-transparent"
            >
              <SelectValue placeholder="Property type" />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-full bg-wine-600 px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-wine-700 lg:py-3"
        >
          <Search className="h-4 w-4" strokeWidth={2.2} />
          Find Property
        </button>
      </form>
    </div>
  );
}

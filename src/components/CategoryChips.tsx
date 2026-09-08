"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { PropertyType } from "@/lib/types";

const TYPES: (PropertyType | "All")[] = [
  "All",
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

/** Plural display label so the row reads like a category nav, not a schema dump. */
function label(t: string) {
  if (t === "All") return "All";
  return t === "Terrace" ? "Terraces" : `${t}s`;
}

export default function CategoryChips({ scrollOnSelect = false }: { scrollOnSelect?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = params.get("type") ?? "All";

  function select(t: string) {
    const next = new URLSearchParams(params.toString());
    if (t === "All") next.delete("type");
    else next.set("type", t);
    const qs = next.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: scrollOnSelect });
  }

  return (
    <div className="relative">
      <div className="no-scrollbar flex justify-start gap-2 overflow-x-auto pb-1 lg:justify-center lg:flex-wrap">
        {TYPES.map((t) => {
          const isActive = active === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => select(t)}
              aria-pressed={isActive}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600 ${
                isActive
                  ? "bg-plum-950 text-white"
                  : "bg-mist-100 text-slate-500 hover:bg-mist-200 hover:text-plum-950"
              }`}
            >
              {label(t)}
            </button>
          );
        })}
      </div>
      {/* edge fade hints that the row scrolls on narrow screens */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white lg:hidden" />
    </div>
  );
}

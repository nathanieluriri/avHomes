import { Bed, Bath, Maximize, Car, Calendar, Home } from "lucide-react";
import type { Property } from "@/lib/types";
import { formatSqm, isEstate, sqftToSqm } from "@/lib/data";

export default function SpecGrid({ property }: { property: Property }) {
  // An estate's rooms live on its options, and its own columns are derived or unset.
  if (isEstate(property.type)) return null;

  const specs = [
    { label: "Bedrooms", value: property.bedrooms, icon: Bed },
    { label: "Bathrooms", value: property.bathrooms, icon: Bath },
    { label: "Area", value: formatSqm(sqftToSqm(property.areaSqft)), icon: Maximize },
    { label: "Parking", value: property.parkingSpaces, icon: Car },
    { label: "Year Built", value: property.yearBuilt, icon: Calendar },
    { label: "Type", value: property.type, icon: Home },
  ];

  return (
    // gap-px + bg-mist-200 draws clean hairlines between cells at any column count, unlike divide-* which breaks on wrapping grids
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-mist-200 bg-mist-200 md:grid-cols-3">
      {specs.map((spec) => (
        <div
          key={spec.label}
          className="flex flex-col items-center justify-center gap-2 bg-white px-4 py-7 text-center"
        >
          <spec.icon className="h-5 w-5 text-wine-600" strokeWidth={1.8} aria-hidden="true" />
          <div className="text-2xl font-bold leading-none tracking-tight text-plum-950 sm:text-3xl">
            {spec.value}
          </div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {spec.label}
          </div>
        </div>
      ))}
    </div>
  );
}

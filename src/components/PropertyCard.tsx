import Link from "next/link";
import Image from "next/image";
import { Bed, Bath, Maximize } from "lucide-react";
import { Property } from "@/lib/types";
import { formatPriceShort } from "@/lib/data";

export default function PropertyCard({
  property,
  priority = false,
}: {
  property: Property;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/listings/${property.slug}`}
      className="card-soft group flex h-full flex-col overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={property.images[0]}
          alt={property.title}
          fill
          priority={priority}
          sizes="(min-width:1280px) 30vw, (min-width:768px) 45vw, 92vw"
          className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.05]"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-navy-950 backdrop-blur">
          {property.status}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold tracking-tight text-navy-950">
          {property.title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{property.location}</p>

        <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Bed className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
            {property.bedrooms} Beds
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Bath className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
            {property.bathrooms} Baths
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Maximize className="h-4 w-4 text-blue-600" strokeWidth={1.8} />
            {property.areaSqft.toLocaleString()}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-mist-200 pt-4 mt-5">
          <span className="text-lg font-bold tracking-tight text-navy-950">
            {formatPriceShort(property.price, property.status)}
          </span>
          <span className="text-sm font-medium text-blue-600 transition-transform duration-200 group-hover:translate-x-1">
            View
          </span>
        </div>
      </div>
    </Link>
  );
}

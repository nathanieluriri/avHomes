import Image from "next/image";
import type { Property } from "@/lib/types";
import { formatPrice } from "@/lib/data";

const TRUST_LINES = [
  "Verified listing, checked by our team",
  "No hidden fees",
  "Response within one business day",
];

export default function AgentPanel({ property }: { property: Property }) {
  const { agent } = property;
  const mailHref = `mailto:${agent.email}?subject=${encodeURIComponent(
    `Enquiry about ${property.title}`
  )}`;
  const telHref = `tel:${agent.phone.replace(/[^+\d]/g, "")}`;

  return (
    <div className="lg:sticky lg:top-28">
      <div className="rounded-2xl border border-mist-200 bg-white p-6 sm:p-7">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-700">
          {property.status}
        </span>

        <p className="mt-4 break-words text-3xl font-bold leading-[1.05] tracking-tight text-navy-950 sm:text-4xl">
          {formatPrice(property.price, property.status)}
        </p>

        <div className="mt-6 flex items-center gap-3 border-t border-mist-200 pt-6">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border border-mist-200">
            <Image
              src={agent.avatarUrl}
              alt={agent.name}
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-navy-950">
              {agent.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">{agent.role}</p>
          </div>
        </div>

        <a
          href={mailHref}
          className="mt-6 block rounded-full bg-blue-600 px-7 py-3.5 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Contact agent
        </a>
        <a
          href={telHref}
          className="mt-3 block rounded-full border border-mist-200 bg-white px-7 py-3.5 text-center text-sm font-semibold text-navy-950 transition-colors duration-200 hover:border-blue-600 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Schedule a tour
        </a>
      </div>

      <ul className="mt-6 space-y-2.5 rounded-2xl border border-mist-200 bg-mist-50 p-4 text-sm text-navy-950/80">
        {TRUST_LINES.map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

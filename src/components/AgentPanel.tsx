import Image from "next/image";
import AgentChat from "@/components/AgentChat";
import type { Property } from "@/lib/types";
import { formatPrice, statusLabel } from "@/lib/data";

const TRUST_LINES = [
  "Verified listing, checked by our team",
  "No hidden fees",
  "Response within one business day",
];

export default function AgentPanel({ property }: { property: Property }) {
  const { agent } = property;
  const telHref = `tel:${agent.phone.replace(/[^+\d]/g, "")}`;

  return (
    <div className="lg:sticky lg:top-28">
      <div className="rounded-2xl border border-mist-200 bg-white p-6 sm:p-7">
        <span className="inline-flex items-center rounded-full bg-wine-50 px-3.5 py-1.5 text-xs font-semibold text-wine-700">
          {statusLabel(property.status)}
        </span>

        <p className="mt-4 break-words text-3xl font-bold leading-[1.05] tracking-tight text-plum-950 sm:text-4xl">
          {formatPrice(property.priceMinor, property.status, property.currency)}
        </p>

        <div className="mt-6 flex items-center gap-3 border-t border-mist-200 pt-6">
          {/*
            An agent has no avatar until somebody uploads one: the admin seeds
            the field with "" on every listing it creates. next/image treats ""
            as a missing src and throws, so the empty case needs its own
            rendering rather than a falsy src. The initial is the same fallback
            the article byline uses.
          */}
          <div className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-mist-200 bg-wine-50">
            {agent.avatarUrl ? (
              <Image
                src={agent.avatarUrl}
                alt={agent.name}
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : (
              <span className="text-lg font-semibold text-wine-700" aria-hidden="true">
                {agent.name.trim().slice(0, 1).toUpperCase() || "A"}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold tracking-tight text-plum-950">
              {agent.name}
            </p>
            <p className="truncate text-sm text-muted-foreground">{agent.role}</p>
          </div>
        </div>

        {/* A conversation on the page, not a mailto. The old link handed the
            buyer to a mail client they may not have configured, lost everyone on
            a shared machine, and left the team with no record until somebody
            forwarded it. */}
        {/* The agent's name and face are no longer passed down. The widget
            resolves them live from the thread, so an agent who uploads a photo
            or a site that switches to a team identity is reflected in an open
            conversation without this page knowing anything about it. */}
        <AgentChat
          propertyId={property.id}
          propertySlug={property.slug ?? undefined}
          propertyTitle={property.title}
        />
        <a
          href={telHref}
          className="mt-3 block rounded-full border border-mist-200 bg-white px-7 py-3.5 text-center text-sm font-semibold text-plum-950 transition-colors duration-200 hover:border-wine-600 hover:text-wine-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine-600"
        >
          Schedule a tour
        </a>
      </div>

      <ul className="mt-6 space-y-2.5 rounded-2xl border border-mist-200 bg-mist-50 p-4 text-sm text-plum-950/80">
        {TRUST_LINES.map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-wine-600" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

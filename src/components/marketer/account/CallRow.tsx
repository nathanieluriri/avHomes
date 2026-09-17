"use client";

import { ChevronRight, Phone } from "lucide-react";
import { AppLink, StatRow } from "../ui";

/**
 * "Call AV Homes" as a row for a `RowGroup`. A plain link rather than a
 * `StatRow href`, because `tel:` is not a screen the router can open.
 */
export function CallRow({ phone }: { phone: string }) {
  const badge = (
    <span
      aria-hidden
      className="grid h-11 w-11 place-items-center rounded-full bg-[linear-gradient(180deg,#c24a6b_0%,#8a2342_100%)] text-white shadow-[inset_0_1px_0_0_rgb(255_214_226/0.45),0_8px_16px_-10px_rgb(194_74_107/0.8)]"
    >
      <Phone className="h-[18px] w-[18px]" strokeWidth={2.2} />
    </span>
  );

  if (phone.trim() === "") {
    return <StatRow lead={badge} label="Call AV Homes" sub="No number is set up yet. Ask in the office." />;
  }
  return (
    <AppLink
      href={`tel:${phone.replace(/\s+/gu, "")}`}
      className="m-press m-press-light flex w-full items-center gap-3 px-4 py-3.5 text-left"
    >
      <span className="shrink-0">{badge}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-m-text">Call AV Homes</span>
        <span className="m-num mt-0.5 block truncate text-[13px] text-m-muted">{phone}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-m-faint" aria-hidden />
    </AppLink>
  );
}

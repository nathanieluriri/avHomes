"use client";

import { humanise } from "@/lib/admin/format";
import { Chip, type ChipTone } from "../ui";

/** One month's pay, from the marketer's side of the pay run. */
const PAY_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  pending: { label: "On the way", tone: "heads-up" },
  paid: { label: "Paid", tone: "good" },
  held: { label: "On hold", tone: "warn" },
};

export function PaymentChip({ status }: { status: string }) {
  const shown = PAY_STATUS[status] ?? { label: humanise(status), tone: "neutral" as const };
  return <Chip tone={shown.tone}>{shown.label}</Chip>;
}

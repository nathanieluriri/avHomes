import { Forward, UserCheck } from "lucide-react";
import type { WhatsappClickRow } from "@avhomes/contracts";
import { relative } from "@/lib/admin/format";

export function ActivityLine({ row }: { row: WhatsappClickRow }) {
  const joined = row.kind === "self";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${joined ? "bg-emerald-50 text-emerald-700" : "bg-wine-50 text-wine-700"}`}
      >
        {joined ? <UserCheck className="h-4 w-4" aria-hidden="true" /> : <Forward className="h-4 w-4" aria-hidden="true" />}
      </span>
      <p className="min-w-0 flex-1 text-[13px] text-plum-950">
        {joined ? (
          <>
            <span className="font-semibold">{row.ownerName}</span> opened the group
          </>
        ) : row.openedByName ? (
          <>
            <span className="font-semibold">{row.openedByName}</span> opened {row.ownerName}&apos;s link
          </>
        ) : (
          <>
            Someone opened <span className="font-semibold">{row.ownerName}</span>&apos;s forwarded link
          </>
        )}
      </p>
      <span className="shrink-0 text-[12px] text-slate-500">{relative(row.at)}</span>
    </li>
  );
}

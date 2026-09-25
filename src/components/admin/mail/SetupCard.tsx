"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Globe, ImageIcon, Inbox, Mail, MapPin, MoreVertical, PenLine, Phone, type LucideIcon } from "lucide-react";
import type { MailSetupItem, MailSetupItemId, MailSetupResponse } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { ResponsiveMenu } from "@/components/admin/BottomSheet";
import { MenuRow } from "./shared";

/**
 * Gmail's setup card, over the inbox: how complete the details every outgoing
 * email depends on are, and one row per thing left to do. Snoozed for a week
 * per member, on the server, so it holds on every device. Gone at 100%.
 */

const ICON: Record<MailSetupItemId, { icon: LucideIcon; tone: string }> = {
  "signature-name": { icon: PenLine, tone: "bg-wine-100 text-wine-700" },
  "signature-title": { icon: PenLine, tone: "bg-wine-100 text-wine-700" },
  "signature-phone": { icon: Phone, tone: "bg-wine-100 text-wine-700" },
  "company-office": { icon: MapPin, tone: "bg-amber-100 text-amber-800" },
  "company-phone": { icon: Building2, tone: "bg-amber-100 text-amber-800" },
  "company-email": { icon: Mail, tone: "bg-amber-100 text-amber-800" },
  "sender-mailbox": { icon: Inbox, tone: "bg-emerald-100 text-emerald-800" },
  "company-website": { icon: Globe, tone: "bg-mist-200 text-slate-600" },
  "company-logo": { icon: ImageIcon, tone: "bg-mist-200 text-slate-600" },
};

const SHOWN = 2;

function Ring({ percent }: { percent: number }) {
  const r = 11;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 28 28" className="h-7 w-7 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="14" cy="14" r={r} fill="none" strokeWidth="3.5" className="stroke-mist-200" />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={`${(c * percent) / 100} ${c}`}
        className="stroke-wine-600 transition-[stroke-dasharray] duration-500"
      />
    </svg>
  );
}

function Row({ item, phone, onDismiss }: { item: MailSetupItem; phone: boolean; onDismiss: () => void }) {
  const { icon: Icon, tone } = ICON[item.id];
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-plum-950">{item.title}</p>
        <p className={`text-[12px] text-slate-600 ${phone ? "" : "truncate"}`}>{item.description}</p>
      </div>
      <Link
        href={item.action.href}
        className="c-tap shrink-0 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-wine-700 hover:bg-wine-50"
      >
        {item.action.label}
      </Link>
      {item.optional ? (
        <ResponsiveMenu
          title={item.title}
          widthClassName="w-44"
          trigger={
            <button
              type="button"
              aria-label={`More for ${item.title}`}
              className="c-tap grid h-11 w-11 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-mist-100 sm:h-8 sm:w-8 sm:rounded-lg"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </button>
          }
          items={(kind) => (
            <MenuRow kind={kind} onSelect={onDismiss}>
              Dismiss
            </MenuRow>
          )}
        />
      ) : (
        // Keeps the action column level with rows that have a menu.
        <span className="hidden w-8 shrink-0 sm:block" aria-hidden="true" />
      )}
    </li>
  );
}

export function MailSetupCard({ phone }: { phone: boolean }) {
  const setup = useAsync<MailSetupResponse>((signal) => api.get("/admin/mail/setup", signal), []);
  // What the last PATCH returned, over the first read.
  const [latest, setLatest] = useState<MailSetupResponse | null>(null);
  const [expanded, setExpanded] = useState(false);
  const data = latest ?? setup.data;
  if (!data) return null;

  const counted = data.items.filter((i) => !data.dismissed.includes(i.id));
  const done = counted.filter((i) => i.done).length;
  const open = counted.filter((i) => !i.done);
  const percent = counted.length === 0 ? 100 : Math.round((done / counted.length) * 100);
  if (open.length === 0 || data.snoozed) return null;

  const rows = expanded ? open : open.slice(0, SHOWN);
  const hidden = open.length - rows.length;

  async function change(body: { snooze?: true; dismiss?: MailSetupItemId }) {
    try {
      setLatest(await api.patch<MailSetupResponse>("/admin/mail/setup", body));
    } catch {
      // The card is a nudge; a failed snooze leaves it on screen, which is the safe side.
    }
  }

  return (
    <section
      aria-label="Email setup"
      className={`overflow-hidden rounded-2xl border border-mist-200 bg-mist-50/70 ${phone ? "mx-3 mb-2 mt-1" : "mx-3 my-3 sm:mx-4"}`}
    >
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
        <Ring percent={percent} />
        <p className="min-w-0 flex-1 text-[14px] font-semibold text-plum-950">Email setup {percent}% complete</p>
        <button
          type="button"
          onClick={() => void change({ snooze: true })}
          title="Hide this for 7 days"
          className="c-tap shrink-0 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-slate-600 hover:bg-mist-100 hover:text-plum-950"
        >
          Snooze
        </button>
      </div>
      <ul className="divide-y divide-mist-200/70 border-t border-mist-200/70 bg-white">
        {rows.map((item) => (
          <Row key={item.id} item={item} phone={phone} onDismiss={() => void change({ dismiss: item.id })} />
        ))}
      </ul>
      {(hidden > 0 || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="c-tap block w-full border-t border-mist-200/70 bg-white px-4 py-2 text-left text-[12.5px] font-semibold text-wine-700 hover:bg-wine-50/60"
        >
          {expanded ? "Show less" : `+${hidden} more`}
        </button>
      )}
    </section>
  );
}

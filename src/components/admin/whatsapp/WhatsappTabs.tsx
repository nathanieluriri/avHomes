"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/admin/ui";

const BASE = "/admin/marketers/whatsapp";

/* The sidebar stops one level down, so this section's own pages are tabs. */
const TABS = [
  { href: BASE, label: "Overview" },
  { href: `${BASE}/partners`, label: "Partners" },
  { href: `${BASE}/activity`, label: "Activity" },
  { href: `${BASE}/link`, label: "Group link" },
] as const;

export function WhatsappHeader({ subtitle }: { subtitle: string }) {
  const pathname = usePathname();
  return (
    <>
      <PageHeader icon={MessagesSquare} title="WhatsApp group" subtitle={subtitle} />
      <nav aria-label="WhatsApp group" className="-mt-2 mb-5 overflow-x-auto border-b border-mist-200 no-scrollbar">
        <ul className="flex gap-1">
          {TABS.map((tab) => {
            const current = tab.href === BASE ? pathname === BASE : pathname.startsWith(tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={current ? "page" : undefined}
                  className={`c-tap relative block whitespace-nowrap px-3 pb-2.5 pt-1 text-[13.5px] font-semibold transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full ${
                    current ? "text-plum-950 after:bg-wine-600" : "text-slate-600 after:bg-transparent hover:text-plum-950"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

export function partnerLink(code: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/wa/${code}`;
}

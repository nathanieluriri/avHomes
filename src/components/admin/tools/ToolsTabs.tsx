"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Download, ExternalLink, Shirt } from "lucide-react";
import { downloadLink } from "@avhomes/contracts";
import { PageHeader } from "@/components/admin/ui";

const BASE = "/admin/marketers/tools";

/* The sidebar stops one level down, so this section's own pages are tabs. */
const TABS = [
  { href: BASE, label: "Guides" },
  { href: `${BASE}/trainings`, label: "Trainings" },
  { href: `${BASE}/merch`, label: "Merch" },
  { href: `${BASE}/requests`, label: "Requests" },
] as const;

export function ToolsHeader({ subtitle, actions }: { subtitle: string; actions?: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <PageHeader icon={Shirt} title="Marketing tools" subtitle={subtitle} actions={actions} />
      <nav aria-label="Marketing tools" className="-mt-2 mb-5 overflow-x-auto border-b border-mist-200 no-scrollbar">
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

/** Download where the host allows it, otherwise open in a new tab. */
export function FileAction({ url, name }: { url: string; name: string }) {
  if (!url) return null;
  const link = downloadLink(url, name);
  const className =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-wine-700 hover:bg-wine-50";
  return link ? (
    <a href={link.href} download={link.filename} className={className}>
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      Download
    </a>
  ) : (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      Open
    </a>
  );
}

export function newToolId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

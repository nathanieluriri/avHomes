import type { Metadata } from "next";
import type { ComponentType, ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  GlyphHome,
  GlyphMenu,
  IconAccount,
  IconAlerts,
  IconBank,
  IconCheckBadge,
  IconDeals,
  IconHandshake,
  IconHelp,
  IconInvite,
  IconListings,
  IconMoney,
  IconPayDay,
  IconPhoto,
  IconReport,
  IconShield,
  IconTeam,
  IconUpdates,
  OrbMark,
  type IconProps,
} from "@/components/marketer/icons3d";

/**
 * A contact sheet for judging the 3D icons by eye: each one on the menu ground,
 * on a card and in a white list row. Development only.
 */

export const metadata: Metadata = { title: "3D icons" };

const SET: { name: string; label: string; Icon: ComponentType<IconProps> }[] = [
  { name: "IconDeals", label: "Deals", Icon: IconDeals },
  { name: "IconTeam", label: "Team", Icon: IconTeam },
  { name: "IconMoney", label: "Money", Icon: IconMoney },
  { name: "IconInvite", label: "Invite", Icon: IconInvite },
  { name: "IconListings", label: "Listings", Icon: IconListings },
  { name: "IconHelp", label: "Help", Icon: IconHelp },
  { name: "IconAccount", label: "Account", Icon: IconAccount },
  { name: "IconAlerts", label: "Alerts", Icon: IconAlerts },
  { name: "IconReport", label: "Report a deal", Icon: IconReport },
  { name: "IconPayDay", label: "Pay day", Icon: IconPayDay },
  { name: "IconUpdates", label: "Updates", Icon: IconUpdates },
  { name: "IconBank", label: "Bank", Icon: IconBank },
  { name: "IconShield", label: "Paused", Icon: IconShield },
  { name: "IconCheckBadge", label: "Approved", Icon: IconCheckBadge },
  { name: "IconPhoto", label: "Add proof", Icon: IconPhoto },
  { name: "IconHandshake", label: "Deal done", Icon: IconHandshake },
];

function BarItem({ label, active, children }: { label: string; active?: boolean; children: ReactNode }) {
  return (
    <span className={`flex flex-col items-center gap-1 text-[10px] font-semibold ${active ? "text-wine-600" : ""}`}>
      {children}
      {label}
    </span>
  );
}

export default function IconSheet() {
  // Never served from a production build.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="min-h-dvh bg-[#140b0e] px-4 pb-16 pt-6 text-white">
      <header className="mx-auto max-w-[1440px]">
        <h1 className="text-[22px] font-bold tracking-[-0.02em]">Marketer 3D icons</h1>
        <p className="mt-1 text-[13px] text-white/60">
          96 in a 128 menu circle, 56 on a card, 40 in a white list row.
        </p>
      </header>

      <div className="mx-auto mt-5 grid max-w-[1440px] gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {SET.map(({ name, label, Icon }) => (
          <section key={name} className="rounded-2xl bg-[#1b1013] p-3 ring-1 ring-white/5">
            <div className="flex items-center gap-3">
              <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full bg-[#2a1a1f]">
                <Icon size={96} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center gap-2.5 rounded-xl bg-[#221418] p-2">
                  <Icon size={56} />
                  <span className="truncate text-[13px] font-semibold text-white/85">{label}</span>
                </div>
                <div className="flex items-center gap-2.5 rounded-xl bg-white px-2 py-1.5 text-ink">
                  <Icon size={40} />
                  <span className="truncate text-[13px] font-semibold">{label}</span>
                </div>
              </div>
            </div>
            <p className="mt-2 font-mono text-[11px] text-white/55">{name}</p>
          </section>
        ))}
      </div>

      <section className="mx-auto mt-8 max-w-[1440px]">
        <h2 className="text-[15px] font-bold">Bottom bar</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="rounded-2xl bg-[#e9e3e5] px-3 pb-3 pt-10">
            <div className="flex items-end justify-around rounded-2xl bg-white px-4 pb-2 pt-3 text-slate-500 shadow-sm">
              <BarItem label="Home" active>
                <GlyphHome />
              </BarItem>
              <span className="-mt-9">
                <OrbMark plus size={64} />
              </span>
              <BarItem label="Menu">
                <GlyphMenu />
              </BarItem>
            </div>
            <p className="mt-2 font-mono text-[11px] text-slate-600">GlyphHome, OrbMark plus, GlyphMenu on white</p>
          </div>
          <div className="rounded-2xl bg-[#221418] px-3 pb-3 pt-10">
            <div className="flex items-end justify-around rounded-2xl bg-[#2a1a1f] px-4 pb-2 pt-3 text-white/70">
              <BarItem label="Home">
                <GlyphHome />
              </BarItem>
              <span className="-mt-9">
                <OrbMark plus size={64} />
              </span>
              <BarItem label="Menu">
                <GlyphMenu />
              </BarItem>
            </div>
            <p className="mt-2 font-mono text-[11px] text-white/55">The same bar on the dark ground</p>
          </div>
          <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-[#1b1013] p-4">
            <OrbMark size={64} />
            <OrbMark plus size={64} />
            <OrbMark plus size={96} />
            <span className="grid place-items-center rounded-2xl bg-white p-3">
              <OrbMark plus size={96} />
            </span>
            <p className="w-full font-mono text-[11px] text-white/55">OrbMark 64, plus 64, plus 96 on dark and white</p>
          </div>
          <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-white p-4 text-ink">
            <GlyphHome />
            <GlyphMenu />
            <GlyphHome size={48} />
            <GlyphMenu size={48} />
            <span className="text-wine-600">
              <GlyphHome size={48} />
            </span>
            <p className="w-full font-mono text-[11px] text-slate-600">GlyphHome, GlyphMenu at 24 and 48</p>
          </div>
        </div>
      </section>
    </div>
  );
}

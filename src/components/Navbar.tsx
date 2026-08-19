"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const links = [
  { href: "/", label: "Home" },
  { href: "/listings", label: "Buy" },
  { href: "/listings?status=For+Rent", label: "Rent" },
  { href: "/#insights", label: "Insights" },
  { href: "/#about", label: "About Us" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-mist-200 bg-white/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white">
            <Image src="/brand/logo.png" alt="AVHomes" fill className="object-contain p-1" />
          </span>
          <span className="text-lg font-bold tracking-tight text-navy-950">AVHomes</span>
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="text-sm font-medium text-slate-500 transition-colors hover:text-navy-950"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/listings"
            className="hidden rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 lg:inline-flex"
          >
            Find Property
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-lg border border-mist-200 bg-white text-navy-950 lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-mist-200 bg-white px-6 py-4 lg:hidden">
          <div className="flex flex-col">
            {links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="border-b border-mist-100 py-3.5 text-sm font-medium text-navy-950"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/listings"
              onClick={() => setOpen(false)}
              className="mt-4 rounded-full bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white"
            >
              Find Property
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

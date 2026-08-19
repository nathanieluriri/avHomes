import { ReactNode } from "react";
import Reveal from "./Reveal";

export interface LegalSection {
  id: string;
  label: string;
}

interface LegalPageProps {
  eyebrow?: string;
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
  children: ReactNode;
}

/**
 * Shared shell for /terms and /privacy: page-header band, a demo disclaimer
 * callout, and a sticky section ToC beside the numbered content on desktop.
 * Each page supplies its own <section id="..."> blocks as children; ids must
 * match the `sections` list so the ToC links resolve.
 */
export default function LegalPage({
  eyebrow = "Legal",
  title,
  lastUpdated,
  sections,
  children,
}: LegalPageProps) {
  return (
    <>
      <section className="border-b border-mist-200 bg-mist-50">
        <div className="mx-auto max-w-7xl px-6 py-14 text-center lg:px-10 lg:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
            Last updated {lastUpdated}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-12 lg:px-10 lg:py-16">
        <Reveal>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm leading-relaxed text-navy-950/80">
              This page is sample copy written for the AVHomes demonstration site. It is
              provided to show how this content and layout can look, and it is not legal
              advice and does not form an enforceable agreement between AVHomes and any
              visitor.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 lg:grid lg:grid-cols-[240px_1fr] lg:items-start lg:gap-12">
          {/* Anchors only make sense once JS-free smooth scroll and real content exist below, so this nav is desktop only per the design brief. */}
          <nav aria-label="Table of contents" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                On this page
              </p>
              <ul className="mt-4 space-y-1 border-l border-mist-200">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="block border-l-2 border-transparent py-1.5 pl-4 text-sm text-ink/70 transition-colors hover:border-blue-600 hover:text-blue-600"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="max-w-3xl space-y-12">{children}</div>
        </div>
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, GraduationCap, X } from "lucide-react";
import type { AuthUser, TutorialProgressList } from "@avhomes/contracts";
import { api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { putWithRetry, tutorialsFor } from "@/lib/admin/tutorials";
import { Skeleton } from "@/components/admin/ui";

/**
 * The suggestion to start the Tutorials, for somebody new, on the screen their
 * console opens on. It leaves once they hide it or finish every tutorial their
 * role has, and it is only ever placed where it cannot push work down: beside
 * something, or below it with its space held.
 */

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six"];

// Whether this browser last showed this person the nudge, so its space is held only for somebody likely to get it.
const cacheKey = (userId: string) => `avh-tutorials-nudge:${userId}`;

function readCache(userId: string): string | null {
  try {
    return localStorage.getItem(cacheKey(userId));
  } catch {
    return null;
  }
}

function writeCache(userId: string, value: "shown" | "hidden") {
  try {
    localStorage.setItem(cacheKey(userId), value);
  } catch {
    // Private mode: the space is simply held again next visit.
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Focuses the next control after `from` in reading order, or the one before it at the end of the page. */
function focusNeighbour(from: HTMLElement): boolean {
  const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !from.contains(el) && el.getClientRects().length > 0 && !el.closest("[inert], [aria-hidden='true']"),
  );
  const after = all.filter((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  const before = all.filter((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING).reverse();
  // A closed drawer's links can pass every check and still refuse focus, so the first one that takes it wins.
  for (const el of [...after, ...before]) {
    el.focus();
    if (document.activeElement === el) return true;
  }
  return false;
}

export function TutorialsNudge({
  user,
  reserve,
  tight = false,
  className = "",
}: {
  user: AuthUser;
  /** Hold the nudge's space while progress loads, for a spot with work below it. */
  reserve: boolean;
  /** Drops the icon below `xl`, for a column that is only about 200px wide there. */
  tight?: boolean;
  className?: string;
}) {
  const { data, error } = useAsync<TutorialProgressList>(
    (signal) => api.get<TutorialProgressList>("/admin/tutorials/progress", signal),
    [],
  );
  // Mounted only after the screen's own data, so this never runs during the server render.
  const [cached] = useState(() => readCache(user.id));
  const [hidden, setHidden] = useState(false);
  const [hideFailed, setHideFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const box = useRef<HTMLElement>(null);

  const list = tutorialsFor(user.role);
  const done = list.filter((tutorial) =>
    data?.items.some((item) => item.tutorialId === tutorial.id && item.completedAt !== null),
  ).length;
  const due = data !== null && data.nudgeDismissedAt === null && list.length > 0 && done < list.length;

  useEffect(() => {
    if (data) writeCache(user.id, due ? "shown" : "hidden");
  }, [data, due, user.id]);

  function hide() {
    // Focus moves before the nudge unmounts, so it never falls to the page body.
    if (box.current && box.current.contains(document.activeElement)) focusNeighbour(box.current);
    setHidden(true);
    setHideFailed(false);
    setAnnouncement("Suggestion hidden. Tutorials stay in the menu, under Help.");
    writeCache(user.id, "hidden");
    putWithRetry("/admin/tutorials/nudge", {}).catch(() => {
      setHidden(false);
      setHideFailed(true);
      setAnnouncement("The tutorials suggestion could not be hidden. Try again.");
      writeCache(user.id, "shown");
    });
  }

  const live = (
    <span className="sr-only" aria-live="polite">
      {announcement}
    </span>
  );

  if (error || hidden || (data && !due)) return live;
  if (!data) {
    return (
      <>
        {live}
        {reserve && cached !== "hidden" && <Skeleton className={`h-[3.625rem] w-full rounded-2xl ${className}`} />}
      </>
    );
  }

  const count = COUNT_WORDS[list.length] ?? String(list.length);
  return (
    <>
      {live}
      <section
        ref={box}
        aria-label="Tutorials"
        className={`flex min-w-0 items-center gap-1 rounded-2xl bg-white p-1 shadow-card motion-safe:animate-in motion-safe:fade-in-0 ${className}`}
      >
        <Link
          href="/admin/tutorials"
          className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 pr-2 transition-colors hover:bg-wine-50/40 active:bg-wine-50/70"
        >
          <span
            className={`h-9 w-9 shrink-0 place-items-center rounded-xl bg-wine-50 text-wine-600 transition-colors group-hover:bg-wine-600 group-hover:text-white ${tight ? "hidden xl:grid" : "grid"}`}
          >
            <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-[13px] font-semibold leading-5 text-plum-950">
              <span className="truncate">Learn the console</span>
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 text-wine-600 transition-transform group-hover:translate-x-0.5"
                strokeWidth={2.2}
                aria-hidden="true"
              />
            </span>
            <span className={`block truncate text-[12px] leading-[1.125rem] ${hideFailed ? "text-red-700" : "text-slate-600"}`}>
              {hideFailed ? (
                "Could not hide this. Try again."
              ) : done === 0 ? (
                `${count} short ${list.length === 1 ? "video" : "videos"}`
              ) : (
                <>
                  <span className="c-num">
                    {done} of {list.length}
                  </span>{" "}
                  done
                </>
              )}
            </span>
          </span>
        </Link>
        <button
          type="button"
          aria-label="Hide the tutorials suggestion"
          title="Hide this"
          onClick={hide}
          className="c-tap grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-550 transition-colors hover:bg-mist-100 hover:text-plum-950 sm:h-8 sm:w-8"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    </>
  );
}

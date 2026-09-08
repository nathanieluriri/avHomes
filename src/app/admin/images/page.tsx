"use client";

import { useRef, useState } from "react";
import type { ImageRecord } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { absoluteUrl } from "@/lib/admin/format";
import { useAsync } from "@/lib/admin/hooks";
import {
  Button,
  Card,
  ConfirmButton,
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
} from "@/components/admin/ui";

/**
 * The image library.
 *
 * Uploads post multipart to the API, which sniffs the MAGIC BYTES and ignores
 * the declared content type entirely. That is why an HTML file renamed to .png
 * is a 400 here rather than a stored XSS served from our own origin.
 *
 * THIS IS THE MOST PHONE-NATIVE SCREEN IN THE CONSOLE, because the phone is the
 * camera roll: the real task is an agent shooting a property and putting those
 * photos on the listing from the same device. So the contact sheet starts at
 * two columns rather than collapsing to one. Sixty images at one photo per
 * screen is roughly eighteen thousand pixels of scroll, which is not a library
 * you can scan, which is the only thing a library is for.
 */

/** One page of the library, and the cursor that follows it. */
interface ImagePage {
  items: ImageRecord[];
  nextCursor: string | null;
}

const PAGE_SIZE = 60;

/**
 * The pre-Clipboard-API copy, kept as a fallback rather than as history.
 *
 * `navigator.clipboard` is undefined on plain http and its write can be refused
 * outright; `execCommand` has neither condition and is still implemented
 * everywhere despite the deprecation, so the pair covers cases neither covers
 * alone. Plain http is also exactly how somebody opens this console on their
 * phone over the local network, so the fallback is a phone path, not a legacy
 * desktop one.
 *
 * WHICH IS WHY IT IS WRITTEN THE WAY iOS NEEDS RATHER THAN THE OBVIOUS WAY.
 * `execCommand("copy")` copies the DOCUMENT selection, and a form control only
 * contributes one while it is itself focused, so the field is focused before it
 * is selected. Safari also refuses `select()` on a readonly field, which is why
 * the textarea is writable. And Safari scrolls to a focused field, so it sits at
 * the origin at one pixel and zero opacity rather than nine thousand pixels off
 * screen, where focusing it yanked the page.
 */
function copyByExecCommand(text: string): boolean {
  const restore = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = false;
  field.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0";
  document.body.append(field);

  field.focus();
  field.select();
  // Older iOS Safari acknowledges `select()` on a textarea without moving the
  // selection. This says the same thing in the form that version honours.
  field.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  field.remove();
  // The selection took focus off the button. Without this the next Tab starts
  // from the top of the document.
  if (restore instanceof HTMLElement) restore.focus();
  return ok;
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export default function ImagesPage() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  /* Sequential uploads over cellular are minutes of a static label, which reads
     as a hang and gets the tab backgrounded, which suspends the in-flight
     request and loses the rest of the queue. A count says it is still moving. */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /* Upload, delete and load-more all report here. One banner, above the grid,
     because a failure notice under sixty tiles is a failure notice nobody
     reads. */
  const [actionError, setActionError] = useState<ApiError | null>(null);
  /* The id of the row whose copy just happened, and whether it worked. A copy
     that silently fails is a button the reader presses twice and then gives up
     on, with no way to learn that the clipboard is the thing refusing. */
  const [copied, setCopied] = useState<{ id: string; ok: boolean } | null>(null);
  /* The delete in flight. `ConfirmButton` already costs two taps, but on a slow
     connection the tile stays put after the second one, so without this the
     third tap posts the same DELETE again. */
  const [deleting, setDeleting] = useState<string | null>(null);
  /* Everything past the first page, appended rather than swapped in. */
  const [more, setMore] = useState<ImagePage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const { data, error, loading, reload } = useAsync<ImagePage>(
    (signal) => api.get<ImagePage>(`/admin/images?limit=${PAGE_SIZE}`, signal),
    [],
    /* Hold the sheet while a delete or an upload refetches page one. Blanking a
       grid the reader has scrolled a long way down to a spinner, and then
       landing them back at the top of it, is a worse answer than a stale
       thumbnail for half a second. */
    { keepPrevious: true },
  );

  const items = [...(data?.items ?? []), ...(more?.items ?? [])];
  const nextCursor = more ? more.nextCursor : (data?.nextCursor ?? null);

  /* Any refetch of page one invalidates the pages appended after it: the same
     record would otherwise arrive twice, once from each. */
  function refresh() {
    setMore(null);
    reload();
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setActionError(null);
    try {
      const res = await api.get<ImagePage>(
        `/admin/images?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      setMore((prev) => ({
        items: [...(prev?.items ?? []), ...res.items],
        nextCursor: res.nextCursor,
      }));
    } catch (err) {
      setActionError(asApiError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setBusy(true);
    setActionError(null);
    setProgress({ done: 0, total: list.length });
    try {
      // One at a time rather than in parallel: the API sniffs and stores each
      // file, and a browser that fires twenty concurrent multipart posts is how
      // an upload screen produces a rate limit instead of a gallery.
      for (const file of list) {
        const form = new FormData();
        form.append("file", file);
        form.append("alt", file.name.replace(/\.[^.]+$/, ""));
        await api.upload<{ image: ImageRecord }>("/admin/images", form);
        setProgress((prev) => (prev ? { done: prev.done + 1, total: prev.total } : prev));
      }
    } catch (err) {
      setActionError(asApiError(err));
    } finally {
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
      // Refetched whether or not the queue finished. A camera roll selection
      // that fails on the fourth of eight photos still uploaded three, and
      // leaving those off screen tells the operator they lost all of them.
      refresh();
    }
  }

  /*
   * The ABSOLUTE url, always. These are stored as origin-relative paths, and
   * "Copy URL" that yields `/api/public/images/img_...png` produces a Google
   * search when it is pasted into an address bar and a dead link when it is
   * pasted anywhere else. `absoluteUrl` resolves against the origin the
   * operator is actually on, so a preview deploy copies preview links.
   */
  async function copy(image: ImageRecord) {
    const url = absoluteUrl(image.url);
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Absent on plain http, and refusable everywhere. `execCommand` has
      // neither condition and is still implemented in every browser.
      ok = copyByExecCommand(url);
    }
    setCopied({ id: image.id, ok });
    setTimeout(() => setCopied(null), 2000);
  }

  async function remove(image: ImageRecord) {
    setActionError(null);
    setDeleting(image.id);
    try {
      await api.del(`/admin/images/${image.id}`);
      refresh();
    } catch (err) {
      setActionError(asApiError(err));
    } finally {
      setDeleting(null);
    }
  }

  const uploadLabel = busy
    ? progress
      ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
      : "Uploading"
    : "Upload images";

  return (
    <>
      <PageHeader
        title="Images"
        subtitle="Upload once, paste the URL into a listing or a post."
        actions={
          <>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(e) => void upload(e.target.files)}
            />
            <Button onClick={() => input.current?.click()} disabled={busy}>
              {uploadLabel}
            </Button>
          </>
        }
      />

      {actionError && (
        <div className="mb-4">
          <ErrorNote error={actionError} />
        </div>
      )}

      {loading && !data && <Spinner />}
      {error && <ErrorNote error={error} onRetry={refresh} />}
      {data && items.length === 0 && (
        <EmptyState
          title="No images yet"
          hint="PNG, JPEG, GIF and WebP, up to 12MB each."
          action={
            /* The first run needs its own way in. Without it the only route is
               back up to the header, which on a phone is above the fold and
               above the empty state telling the reader to act. */
            <Button onClick={() => input.current?.click()} disabled={busy}>
              {uploadLabel}
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        /* Two columns at the narrowest width, three from sm, then the four the
           desktop sheet has always had from lg. Two 158px tiles on a 360px
           screen is a contact sheet you can scan; one 328px tile is a slideshow
           you have to scroll. Only that sub-640 behaviour was in question, so
           the wide counts stay exactly where they were. */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {items.map((image) => (
            <Card key={image.id} padded={false} className="p-2 sm:p-3">
              {/* A plain img: these are already-sized blob URLs on an arbitrary
                  host, and next/image would need a remotePattern per store.

                  The intrinsic size comes from the record, so the browser can
                  reason about the download before it starts one and can decode
                  off the main thread. The grid still asks for up to sixty
                  full-resolution originals at a ~150px display width, which is
                  the one thing on this screen that a phone on cellular cannot
                  be argued out of: it needs a resized variant from the API. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.alt}
                width={image.width}
                height={image.height}
                decoding="async"
                loading="lazy"
                className="aspect-[4/3] w-full rounded-lg bg-mist-100 object-cover"
              />
              {/* These two lines are the only thing telling one grey rectangle
                  from another, so they are content and sit at the 12px floor
                  rather than under it. */}
              <p className="mt-2 truncate text-[12px] font-medium text-plum-950">
                {image.alt || image.id}
              </p>
              <p className="truncate text-[12px] text-slate-600">
                {image.width}x{image.height} · {Math.round(image.bytes / 1024)}KB
              </p>

              {/* Stacked at every width, not a row that becomes a stack. The
                  armed confirm label is wider than the resting one, and a tile
                  is 150 to 190px whatever the breakpoint, so a two-up row would
                  push the second button out of its own card the moment somebody
                  tapped Delete. */}
              <div className="mt-2 flex flex-col gap-2">
                <Button
                  variant={copied?.id === image.id && !copied.ok ? "danger" : "ghost"}
                  onClick={() => void copy(image)}
                  className="w-full"
                >
                  {copied?.id !== image.id ? "Copy URL" : copied.ok ? "Copied" : "Copy blocked"}
                </Button>
                {/* There is no trash and no undo for an image, so the delete
                    asks once in place. */}
                <ConfirmButton
                  confirmLabel="Yes, delete"
                  onConfirm={() => void remove(image)}
                  disabled={deleting === image.id}
                  className="w-full"
                >
                  {deleting === image.id ? "Deleting" : "Delete"}
                </ConfirmButton>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* The server has been handing back a cursor all along and the screen
          never drew it, so the library silently stopped at sixty with nothing
          saying more existed. */}
      {items.length > 0 && nextCursor && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className="w-full sm:w-auto"
          >
            {loadingMore ? "Loading" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}

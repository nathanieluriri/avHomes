"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ImageRecord } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync, useMediaQuery } from "@/lib/admin/hooks";
import { BottomSheet } from "./BottomSheet";
import { Button, ConfirmButton, EmptyState, ErrorNote, IconButton, Spinner } from "./ui";

/**
 * The image field.
 *
 * Images are chosen, seen and ordered here. They are never typed as URLs: a
 * textarea of paths cannot show you what you picked, cannot tell a broken link
 * from a working one, and makes the order of a gallery a counting exercise.
 *
 * Every control is ALWAYS VISIBLE rather than revealed on hover. A hover-only
 * control is not merely awkward on a touch screen, it is unreachable, and the
 * only way to discover that is to hold a phone.
 *
 * A PHONE IS THE CAMERA ROLL, so this is the surface where that matters most:
 * the likely real task is an agent shooting a property and putting the photos on
 * the listing from the same device. Two consequences run through the file. The
 * pointer, not the width, decides what is offered, because HTML5 drag never
 * fires from a finger and a drop zone drawn for a thumb is an affordance that
 * does nothing. And on a phone every control inside a tile is drawn at its full
 * touch size rather than leaning on `.c-tap`, because the tile clips its own
 * overflow and a 44px halo around a 20px button is clipped away with it.
 */

/* The server's ceiling, checked here as well so an oversized camera original is
   refused in a millisecond instead of after a minute of cellular upload. */
const MAX_MB = 12;
const MAX_BYTES = MAX_MB * 1024 * 1024;

interface ImagePickerProps {
  value: string[];
  onChange: (urls: string[]) => void;
  /** 1 makes it a single-image field, which is how a post cover uses it. */
  max?: number;
  /** Names the first slot, since position 0 is the one the site leads with. */
  coverLabel?: string;
}

export default function ImagePicker({ value, onChange, max = 40, coverLabel = "Cover" }: ImagePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [library, setLibrary] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const single = max === 1;
  const full = value.length >= max;

  /* `(pointer: fine)` rather than a width, because dragging is a property of
     the POINTER. The HTML5 drag events below never fire from a finger, at any
     screen size, so a touch tablet at 900px is as unable to drag as a 360px
     phone. The hook's server snapshot is false, so touch is what hydrates and
     nobody is handed a dead affordance while waiting for the real answer. */
  const canDrag = useMediaQuery("(pointer: fine)");

  async function upload(files: FileList | File[] | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, Math.max(0, max - value.length));
    if (picked.length === 0) return;

    // Sized before anything is posted. Multi-select from a camera roll is the
    // normal gesture here and a modern phone photo can clear 12MB, so without
    // this the failure is minutes of upload followed by a 413 that takes the
    // rest of the queue with it.
    const tooBig = picked.filter((file) => file.size > MAX_BYTES);
    const list = picked.filter((file) => file.size <= MAX_BYTES);
    setNotice(
      tooBig.length === 0
        ? null
        : `${tooBig.map((file) => `${file.name} (${megabytes(file.size)})`).join(", ")} ${
            tooBig.length === 1 ? "is" : "are"
          } over the ${MAX_MB}MB limit, so ${tooBig.length === 1 ? "it was" : "they were"} skipped.`,
    );
    if (list.length === 0) {
      if (input.current) input.current.value = "";
      return;
    }

    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: list.length });
    const added: string[] = [];
    try {
      // One at a time. A browser firing twenty concurrent multipart posts is how
      // an upload field produces a rate limit instead of a gallery.
      for (const file of list) {
        const form = new FormData();
        form.append("file", file);
        form.append("alt", file.name.replace(/\.[^.]+$/, ""));
        const res = await api.upload<{ image: ImageRecord }>("/admin/images", form);
        added.push(res.image.url);
        // The count is the only thing moving during a sequential upload. Eight
        // photos over cellular is minutes under one static word, which reads as
        // a hang and gets the tab backgrounded, which suspends the fetch.
        setProgress({ done: added.length, total: list.length });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      // Whatever DID upload is kept. Losing three good files because the fourth
      // was a PDF would be the worst possible answer to a partial failure.
      if (added.length > 0) onChange([...value, ...added]);
      setBusy(false);
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onChange(next);
  }

  /* The dashed frame is the drop target's affordance, so it is drawn where
     dropping works and nowhere else. On a phone it is 28px of a 296px card
     spent on a desktop metaphor, and that 28px is most of what the tile control
     row needs. The empty state is the exception at every width: there the frame
     is not describing a drop, it is drawing the tap target itself. */
  const frame =
    value.length === 0
      ? `rounded-xl border-2 border-dashed p-3 ${
          dragOver ? "border-wine-500 bg-wine-50" : "border-mist-200 bg-mist-50"
        }`
      : canDrag
        ? `sm:rounded-xl sm:border-2 sm:border-dashed sm:p-3 ${
            dragOver ? "sm:border-wine-500 sm:bg-wine-50" : "sm:border-mist-200 sm:bg-mist-50"
          }`
        : "";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple={!single}
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
        <Button onClick={() => input.current?.click()} disabled={busy || full}>
          {busy
            ? progress
              ? `Uploading ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
              : "Uploading"
            : single
              ? "Upload image"
              : "Upload images"}
        </Button>
        <Button variant="ghost" onClick={() => setLibrary(true)} disabled={full} spotlight="image-library">
          Choose from library
        </Button>
        <span className="text-xs text-muted-foreground">
          {value.length}/{max} · PNG, JPEG, GIF or WebP up to {MAX_MB}MB
        </span>
      </div>

      {notice && (
        <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{notice}</p>
      )}

      {error && (
        <div className="mb-2">
          <ErrorNote error={error} />
        </div>
      )}

      <div
        onDragOver={(e) => {
          // Only for FILES dragged in from the desktop. A tile being reordered
          // inside the grid must not light up the drop zone.
          if (dragIndex !== null) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (dragIndex !== null) return;
          e.preventDefault();
          setDragOver(false);
          void upload(e.dataTransfer.files);
        }}
        className={`transition-colors ${frame}`}
      >
        {value.length === 0 ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 py-8 text-sm text-muted-foreground"
          >
            {/* The words follow the pointer for the same reason the frame does.
                "Drop" and "click" and "file" are desktop words for somebody who
                is about to pick a photo they took ten seconds ago. */}
            <span className="font-semibold text-plum-950">
              {canDrag ? "Drop images here" : "Add photos"}
            </span>
            <span>{canDrag ? "or click to choose a file" : "Tap to pick from your camera roll"}</span>
          </button>
        ) : (
          <ul className={`grid gap-3 ${single ? "grid-cols-1 sm:max-w-xs" : "grid-cols-2 sm:grid-cols-3"}`}>
            {value.map((url, i) => (
              <li
                key={`${url}-${i}`}
                draggable={canDrag && !single}
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                }}
                className={`overflow-hidden rounded-lg border bg-white ${
                  dragIndex === i ? "border-wine-500 opacity-50" : "border-mist-200"
                }`}
              >
                <div className="relative">
                  <Thumb url={url} />
                  {i === 0 && !single && (
                    /* Smaller below `sm`. At 11px with padding this badge covers
                       half the width of a 140px tile, and the photo is the one
                       thing the tile exists to show. */
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-plum-950/85 px-1.5 py-0.5 text-[10px] font-semibold text-white sm:left-2 sm:top-2 sm:px-2 sm:text-[11px]">
                      {coverLabel}
                    </span>
                  )}
                </div>

                {/* STACKED below `sm`. Across a 124px tile two arrows and a
                    Remove label measure wider than the tile, and the `li` clips
                    its overflow, so the label was cut off rather than wrapped.
                    Stacking also lets each control take its full touch height:
                    `.c-tap` is no help inside an `overflow-hidden` box, because
                    the halo that grows the hit area is clipped along with
                    everything else. */}
                <div className="flex flex-col gap-2 px-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:py-1.5">
                  {!single && (
                    /* The arrows are the ONLY reorder path a phone has, so below
                       `sm` they are drawn at the full 44px rather than as
                       glyphs. From `sm` up they go back to the dense 28px this
                       photo grid has always been drawn with: the clipped-halo
                       argument above is an argument about a thumb, and a mouse
                       aiming at a control strip under a thumbnail was never
                       asking for a bevelled 36px square. The row tightens again
                       only where `.c-tap` is inert, because two coarse-pointer
                       halos at `gap-1` trade edges. */
                    <div
                      className={`flex items-center justify-center gap-2 sm:justify-start ${
                        canDrag ? "sm:gap-1" : ""
                      }`}
                    >
                      <IconButton
                        label="Move earlier"
                        icon={ArrowLeft}
                        size="dense"
                        onClick={() => move(i, i - 1)}
                        disabled={i === 0}
                      />
                      <IconButton
                        label="Move later"
                        icon={ArrowRight}
                        size="dense"
                        onClick={() => move(i, i + 1)}
                        disabled={i === value.length - 1}
                      />
                    </div>
                  )}
                  {/* Removal only drops the reference, the file stays in the
                      library, but it sits a thumb's width from "Move later" and
                      an accidental one costs the reader a trip through the
                      library to find the photo again. */}
                  <ConfirmButton
                    confirmLabel="Yes, remove"
                    onConfirm={() => onChange(value.filter((_, index) => index !== i))}
                    className="w-full sm:w-auto"
                  >
                    Remove
                  </ConfirmButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!single && value.length > 1 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {/* Advertising drag on a device that cannot drag is worse than saying
              nothing: it sends somebody to try the gesture, fail silently, and
              conclude the field is broken. */}
          {canDrag ? "Drag a tile, or use the arrows, to reorder." : "Use the arrows to reorder."} The
          first image is the {coverLabel.toLowerCase()}.
        </p>
      )}

      {library && (
        <LibraryModal
          onClose={() => setLibrary(false)}
          onPick={(url) => {
            if (value.length < max) onChange([...value, url]);
            if (single) setLibrary(false);
          }}
          chosen={value}
        />
      )}
    </div>
  );
}

function megabytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * A thumbnail that says so when the file behind it is gone.
 *
 * A stored URL whose object was deleted renders as a silent grey rectangle
 * otherwise, which reads as "still uploading" and sends somebody to wait for
 * something that is never going to arrive.
 */
function Thumb({ url }: { url: string }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <div className="grid aspect-[4/3] w-full place-items-center bg-red-50 px-2 text-center text-xs text-red-700">
        Image not found
      </div>
    );
  }
  return (
    // A plain img: these are same-origin API paths today and arbitrary CDN hosts
    // under blob storage, and next/image would need a remotePattern per store.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="aspect-[4/3] w-full bg-mist-100 object-cover"
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

/**
 * Picks from images already uploaded, so one photo is not stored twice.
 *
 * A `BottomSheet`, which settles four separate problems this panel used to have
 * on a phone. It portals out of `.c-sheet`, whose transform animates on every
 * navigation and which therefore became the containing block for a `fixed`
 * child: `inset: 0` resolved against the 66rem page column instead of the
 * viewport, so the backdrop covered the column and the panel centred itself
 * somewhere down a page far taller than the window, which reads exactly like a
 * button that does nothing. Its header is `shrink-0`, so Close no longer
 * scrolls off the screen on a device with no Escape key. Its body owns the
 * scroll with `overscroll-contain`, so a flick at the end of the grid stops
 * there instead of scrolling the console behind it. And it is a sheet under the
 * thumb below `sm` rather than a centred box with every control at the top.
 *
 * MOUNTED ONLY WHILE OPEN, so opening an editor does not fetch sixty images
 * nobody asked for. `console` rides along on `className` because the focus ring
 * is declared as `.console :focus-visible` and the sheet has left that subtree.
 */
function LibraryModal({
  onClose,
  onPick,
  chosen,
}: {
  onClose: () => void;
  onPick: (url: string) => void;
  chosen: string[];
}) {
  const { data, error, loading, reload } = useAsync<{ items: ImageRecord[] }>(
    (signal) => api.get<{ items: ImageRecord[] }>("/admin/images?limit=60", signal),
    [],
  );

  return (
    <BottomSheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Image library"
      /* `widthClassName`, not `className`. The prop REPLACES the sheet's own
         `sm:w-*`; passing a second one through `className` would leave two
         arbitrary values of the same utility in the same variant, and Tailwind
         resolves those by its own build order rather than by which was written
         last. `console` is no longer needed either: BottomSheet applies it, so
         a sheet cannot lose its focus rings by forgetting to. */
      widthClassName="sm:w-[min(48rem,calc(100vw-2rem))]"
    >
      {loading && <Spinner />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data?.items.length === 0 && (
        <EmptyState
          bare
          title="Nothing uploaded yet"
          hint="Close this sheet and use Upload to add a photo from this device."
        />
      )}

      {/* A contact sheet is only useful if you can scan it, so it never falls to
          one column. Three from 400px up, where a third thumbnail is still wide
          enough to recognise a room in. */}
      <div className="grid grid-cols-2 gap-3 xs:grid-cols-3 sm:grid-cols-4">
        {data?.items.map((image) => {
          const already = chosen.includes(image.url);
          return (
            <button
              key={image.id}
              type="button"
              onClick={() => onPick(image.url)}
              disabled={already}
              className={`overflow-hidden rounded-lg border text-left transition-colors ${
                already ? "border-wine-500 opacity-50" : "border-mist-200 hover:border-wine-500"
              }`}
            >
              {/* The intrinsic size is on the element so the browser can reserve
                  the box and decode off the main thread. These are full
                  resolution originals until the API grows a thumbnail. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.alt}
                width={image.width}
                height={image.height}
                className="aspect-[4/3] w-full bg-mist-100 object-cover"
                loading="lazy"
                decoding="async"
              />
              {/* Real content, not decoration: it is the only thing telling one
                  4/3 rectangle from another, and "Already added" is the reason a
                  tile will not respond. 11px is for the uppercase label ramp. */}
              <span className="block truncate px-2 py-1.5 text-xs text-slate-600">
                {already ? "Already added" : image.alt || image.id}
              </span>
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}

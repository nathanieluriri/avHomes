"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageRecord } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import { Button, Card, ErrorNote, Spinner } from "./ui";

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
 */

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
  const [error, setError] = useState<ApiError | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [library, setLibrary] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const single = max === 1;
  const full = value.length >= max;

  async function upload(files: FileList | File[] | null) {
    if (!files) return;
    const list = Array.from(files).slice(0, Math.max(0, max - value.length));
    if (list.length === 0) return;

    setBusy(true);
    setError(null);
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
      }
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      // Whatever DID upload is kept. Losing three good files because the fourth
      // was a PDF would be the worst possible answer to a partial failure.
      if (added.length > 0) onChange([...value, ...added]);
      setBusy(false);
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
          {busy ? "Uploading" : single ? "Upload image" : "Upload images"}
        </Button>
        <Button variant="ghost" onClick={() => setLibrary(true)} disabled={full}>
          Choose from library
        </Button>
        <span className="text-xs text-muted-foreground">
          {value.length}/{max} · PNG, JPEG, GIF or WebP up to 12MB
        </span>
      </div>

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
        className={`rounded-xl border-2 border-dashed p-3 transition-colors ${
          dragOver ? "border-wine-500 bg-wine-50" : "border-mist-200 bg-mist-50"
        }`}
      >
        {value.length === 0 ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 py-8 text-sm text-muted-foreground"
          >
            <span className="font-semibold text-plum-950">Drop images here</span>
            <span>or click to choose a file</span>
          </button>
        ) : (
          <ul className={`grid gap-3 ${single ? "grid-cols-1 sm:max-w-xs" : "grid-cols-2 sm:grid-cols-3"}`}>
            {value.map((url, i) => (
              <li
                key={`${url}-${i}`}
                draggable={!single}
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
                    <span className="absolute left-2 top-2 rounded-full bg-plum-950/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {coverLabel}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    {!single && (
                      <>
                        <IconButton label="Move earlier" onClick={() => move(i, i - 1)} disabled={i === 0}>
                          {"←"}
                        </IconButton>
                        <IconButton
                          label="Move later"
                          onClick={() => move(i, i + 1)}
                          disabled={i === value.length - 1}
                        >
                          {"→"}
                        </IconButton>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((_, index) => index !== i))}
                    className="rounded px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!single && value.length > 1 && (
        <p className="mt-1 text-xs text-muted-foreground">
          Drag a tile, or use the arrows, to reorder. The first image is the {coverLabel.toLowerCase()}.
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
      <div className="grid aspect-[4/3] w-full place-items-center bg-red-50 px-2 text-center text-[11px] text-red-700">
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
      onError={() => setBroken(true)}
    />
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded border border-mist-200 px-1.5 py-0.5 text-xs text-plum-950 hover:bg-mist-100 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/**
 * Picks from images already uploaded, so one photo is not stored twice.
 *
 * PORTALLED TO `document.body`, and that is what makes it appear at all.
 * `.c-sheet` animates a transform on every navigation, and a transformed
 * ancestor becomes the containing block for a fixed child: `inset: 0` then
 * resolved against the 66rem page column instead of the viewport, so the
 * backdrop covered the column and the panel centred itself somewhere down the
 * middle of a page far taller than the window. The dimming was visible and the
 * dialog was not, which reads exactly like a button that does nothing.
 * `SaveBar` is portalled for the same reason.
 *
 * Both console classes, because the panel has now left that subtree: the
 * marketing site strips box-shadow from everything outside it, and the focus
 * ring every control in here relies on is declared as `.console :focus-visible`.
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

  /* Escape closes it. A dialog over a long form with its Close button scrolled
     out of the panel is otherwise a trap for anyone not using a mouse. */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="console console-float fixed inset-0 z-[80] grid place-items-center bg-plum-950/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose from the image library"
      onClick={onClose}
    >
      <Card
        className="max-h-[80vh] w-full max-w-3xl overflow-y-auto"
        // Stops a click inside the panel reaching the backdrop's close handler.
      >
        <div onClick={(e) => e.stopPropagation()}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-plum-950">Image library</h2>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          {loading && <Spinner />}
          {error && <ErrorNote error={error} onRetry={reload} />}
          {data?.items.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing uploaded yet. Close this and use Upload.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.alt}
                    className="aspect-[4/3] w-full bg-mist-100 object-cover"
                    loading="lazy"
                  />
                  <span className="block truncate px-2 py-1 text-[11px] text-muted-foreground">
                    {already ? "Already added" : image.alt || image.id}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
    </div>,
    document.body,
  );
}

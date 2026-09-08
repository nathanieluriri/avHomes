"use client";

import { useRef, useState } from "react";
import { Link2, Paperclip, Trash2, Undo2, X } from "lucide-react";
import type { DesignNote, ImageRecord, MarkKind, NoteAttachment, NoteMark } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { Button, ErrorNote } from "@/components/admin/ui";
import { DEFAULT_COLOR, MARK_COLORS, MarkLayer, TOOLS } from "./marks";

/**
 * Draw on the frozen picture, then say what you mean.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A MARK CANNOT BE SAVED WITHOUT A COMMENT, AND THAT IS THE WHOLE POINT.
 *
 * A circle on its own is not feedback. It is a developer opening a screenshot
 * six weeks later and guessing whether the ring means "too big", "wrong colour"
 * or "move this above the fold". So Save is disabled until there is a sentence,
 * and the placeholder asks for the one thing a drawing cannot carry: what should
 * be different.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The picture is a real upload. It goes through the same media route as any
 * other image, magic bytes and all, and this note stores the URL that came back.
 */

export interface Capture {
  /** Object URL of the PNG, for the preview. Revoked by the parent. */
  previewUrl: string;
  blob: Blob;
  width: number;
  height: number;
  path: string;
  /** Set when the studio was in copy mode and a text element was clicked. */
  copyBefore?: string;
}

/** `coarse` is recorded on the way down, because the stray-mark guard in `onUp`
 *  has no pointer event of its own to ask. */
type Draft = NoteMark & { coarse: boolean };

export function Markup({
  capture,
  onCancel,
  onSaved,
}: {
  capture: Capture;
  onCancel: () => void;
  onSaved: (note: DesignNote) => void;
}) {
  const isCopy = capture.copyBefore !== undefined;

  const [tool, setTool] = useState<MarkKind>("ellipse");
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [marks, setMarks] = useState<NoteMark[]>([]);
  const [drawing, setDrawing] = useState<Draft | null>(null);
  const [comment, setComment] = useState("");
  const [copyAfter, setCopyAfter] = useState(capture.copyBefore ?? "");
  const [attachments, setAttachments] = useState<NoteAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const surface = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /*
   * Pointer events, not mouse events, so a pen and a finger both draw. The
   * capture call is what makes a stroke survive the pointer leaving the image:
   * without it, dragging a circle slightly past the edge ends the stroke
   * wherever the cursor happened to cross the boundary.
   */
  function pointAt(event: React.PointerEvent): [number, number] {
    const box = surface.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [
      clamp((event.clientX - box.left) / box.width),
      clamp((event.clientY - box.top) / box.height),
    ];
  }

  function onDown(event: React.PointerEvent) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const [x, y] = pointAt(event);
    setDrawing({
      kind: tool,
      color,
      points: [x, y, x, y],
      coarse: event.pointerType !== "mouse",
    });
  }

  function onMove(event: React.PointerEvent) {
    if (!drawing) return;
    const [x, y] = pointAt(event);
    setDrawing((current) => {
      if (!current) return current;
      if (current.kind === "pen") {
        return { ...current, points: [...current.points, x, y] };
      }
      // Every other tool is defined by two corners, so the drag only ever
      // rewrites the second one.
      return { ...current, points: [current.points[0] ?? 0, current.points[1] ?? 0, x, y] };
    });
  }

  function onUp() {
    if (!drawing) return;
    /*
     * A click with no drag is discarded rather than stored as a zero-size shape.
     * Somebody tapping the image to focus it should not leave an invisible mark
     * that later renders as a dot nobody can select or explain.
     *
     * THE SLOP IS A FRACTION OF THE SURFACE, SO IT HAS TO SCALE WITH THE
     * POINTER. A mouse press moves under a pixel, and 0.005 of a 1100px picture
     * is five and a half of them, which is the right figure for one. A finger
     * moves three to six pixels on what its owner thinks was a tap, and on a
     * narrower surface that is one to two per cent, so the mouse figure passes
     * every accidental touch straight through as a real mark. The only recovery
     * is Undo, two rows up in the header.
     */
    const [x1, y1, x2, y2] = drawing.points;
    const slop = drawing.coarse ? 0.02 : 0.005;
    const tiny =
      drawing.kind !== "pen" &&
      Math.abs((x2 ?? 0) - (x1 ?? 0)) < slop &&
      Math.abs((y2 ?? 0) - (y1 ?? 0)) < slop;
    if (!tiny && drawing.points.length >= 4) {
      const { coarse: _coarse, ...mark } = drawing;
      void _coarse;
      setMarks((all) => [...all, mark]);
    }
    setDrawing(null);
  }

  async function attachImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("alt", file.name.replace(/\.[^.]+$/, ""));
      const res = await api.upload<{ image: ImageRecord }>("/admin/images", form);
      setAttachments((all) => [...all, { kind: "image", url: res.image.url, label: file.name }]);
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function closeLink() {
    setLinkOpen(false);
    setLinkDraft("");
    setLinkError(null);
  }

  /**
   * Reads the inline link field.
   *
   * IT USED TO BE A `window.prompt`, and replacing it is a desktop fix as much
   * as a touch one. A prompt is an unstyled system dialog with no room to say
   * what a valid link is; both of its refusals below could only surface after it
   * had already closed, as a shared error box further down the pane; and a
   * handful of in-app browsers suppress `prompt()` outright, which leaves the
   * button silently doing nothing at all.
   */
  function attachLink() {
    const url = linkDraft.trim();
    if (url === "") {
      setLinkError("Paste a link first.");
      return;
    }
    /*
     * `http` and `https` only. A field that accepts whatever is typed accepts
     * `javascript:` too, and this URL is later rendered as an anchor somebody on
     * the team clicks.
     */
    let label: string;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        setLinkError("Links must start with http or https.");
        return;
      }
      label = parsed.hostname.replace(/^www\./, "");
    } catch {
      setLinkError("That is not a link. It needs to start with https://");
      return;
    }
    setAttachments((all) => [...all, { kind: "link", url, label }]);
    closeLink();
  }

  async function save() {
    if (comment.trim() === "") return;
    setBusy(true);
    setError(null);
    try {
      // The shot first. A note whose picture failed to upload is a note with a
      // broken anchor, so it must not be written at all.
      const form = new FormData();
      form.append("file", capture.blob, "capture.png");
      form.append("alt", `Studio capture of ${capture.path}`);
      const shot = await api.upload<{ image: ImageRecord }>("/admin/images", form);

      const res = await api.post<{ note: DesignNote }>("/admin/notes", {
        path: capture.path,
        kind: isCopy ? "copy" : "markup",
        comment: comment.trim(),
        copyBefore: capture.copyBefore ?? null,
        copyAfter: isCopy ? copyAfter : null,
        shotUrl: shot.image.url,
        shotWidth: capture.width,
        shotHeight: capture.height,
        marks,
        attachments,
      });
      onSaved(res.note);
    } catch (err) {
      setError(asApiError(err));
    } finally {
      setBusy(false);
    }
  }

  const live = drawing ? [...marks, drawing] : marks;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-plum-950/70">
      <header className="flex shrink-0 flex-wrap items-center gap-2 bg-white px-3 py-2 shadow-card">
        <span className="mr-1 text-[13px] font-semibold text-plum-950">
          {isCopy ? "Suggest new wording" : "Mark up"}
        </span>

        {!isCopy && (
          <>
            {/* `.c-tap` on every 32px control in this row, and `gap-2` to hold
                the halos apart. The studio only renders at `lg` and up, which
                is not the same as "a mouse": an iPad in landscape is a coarse
                pointer at 1024px, and this is the surface it draws on. */}
            <div role="group" aria-label="Tool" className="flex items-center gap-2">
              {TOOLS.map((entry) => (
                <button
                  key={entry.kind}
                  type="button"
                  aria-pressed={tool === entry.kind}
                  title={entry.hint}
                  onClick={() => setTool(entry.kind)}
                  className={`c-tap h-8 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
                    tool === entry.kind
                      ? "bg-plum-950 text-white"
                      : "text-slate-600 hover:bg-mist-100 hover:text-plum-950"
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>

            {/* A REAL BOX ON A FINGER, not a `.c-tap` halo.
                Five 24px dots were the smallest targets in the console, on the
                one screen somebody drives with a fingertip. A 44px halo cannot
                fix that here: it bleeds ten pixels past each dot into a
                six pixel gap, so the five swatches end up trading edges and the
                colour you get is not the one you aimed at. The button grows to
                a genuine 44px square on a coarse pointer instead and the dot
                rides inside it, so with a mouse this draws the same 24px row it
                always did. */}
            <div role="group" aria-label="Colour" className="flex items-center gap-2 pl-1">
              {MARK_COLORS.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  aria-label={entry.label}
                  aria-pressed={color === entry.value}
                  onClick={() => setColor(entry.value)}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-lg pointer-coarse:h-11 pointer-coarse:w-11"
                >
                  <span
                    style={{ background: entry.value }}
                    className={`block h-6 w-6 rounded-full transition-transform ${
                      color === entry.value
                        ? "scale-110 ring-2 ring-plum-950 ring-offset-2"
                        : "hover:scale-110"
                    }`}
                  />
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMarks((all) => all.slice(0, -1))}
              disabled={marks.length === 0}
              className="c-tap flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 disabled:cursor-not-allowed disabled:text-mist-400"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              Undo
            </button>
            <button
              type="button"
              onClick={() => setMarks([])}
              disabled={marks.length === 0}
              className="c-tap flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950 disabled:cursor-not-allowed disabled:text-mist-400"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="c-tap ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-mist-100 hover:text-plum-950"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:flex-row">
        {/* The picture. `touch-none` is what lets a finger draw rather than
            scroll the pane underneath it. */}
        <div className="flex min-h-0 flex-1 items-start justify-center">
          <div
            ref={surface}
            onPointerDown={isCopy ? undefined : onDown}
            onPointerMove={isCopy ? undefined : onMove}
            onPointerUp={isCopy ? undefined : onUp}
            onPointerCancel={isCopy ? undefined : onUp}
            className={`relative max-w-full touch-none select-none overflow-hidden rounded-xl bg-white shadow-pop ${
              isCopy ? "" : "cursor-crosshair"
            }`}
            style={{ aspectRatio: `${capture.width} / ${capture.height}` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={capture.previewUrl}
              alt={`The page at ${capture.path}`}
              draggable={false}
              className="block h-full w-full object-contain"
            />
            <MarkLayer marks={live} width={capture.width} height={capture.height} />
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-3 rounded-xl bg-white p-4 lg:w-80">
          {isCopy && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Words on the page now
              </p>
              <p className="rounded-lg bg-mist-100 p-2.5 text-[13px] leading-relaxed text-slate-600">
                {capture.copyBefore || "(empty)"}
              </p>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  What it should say
                </span>
                <textarea
                  value={copyAfter}
                  onChange={(event) => setCopyAfter(event.target.value)}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-mist-200 px-3 py-2 text-[13px] text-plum-950 outline-none focus:border-wine-500"
                />
              </label>
            </div>
          )}

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              What should be different
            </span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={5}
              autoFocus
              placeholder={
                isCopy
                  ? "Why this wording. Anything the developer should know."
                  : "The price is hard to read against the photo. Can it sit on a solid panel?"
              }
              className="w-full resize-y rounded-lg border border-mist-200 px-3 py-2 text-[13px] text-plum-950 outline-none placeholder:text-slate-550 focus:border-wine-500"
            />
          </label>

          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              Inspiration
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(event) => void attachImage(event.target.files)}
            />
            {/* `gap-2`, because `BUTTON_BASE` carries `.c-tap`: two of these at
                six pixels apart would steal each other's halo edges. */}
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()} disabled={busy}>
                <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                Add a picture
              </Button>
              {/* A link, not an upload, for video. A video store is a different
                  problem from an image store, and a Loom URL is what people
                  actually have to hand. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (linkOpen ? closeLink() : setLinkOpen(true))}
                disabled={busy}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Add a link
              </Button>
            </div>

            {linkOpen && (
              <div className="mt-2 space-y-1.5">
                <input
                  type="url"
                  inputMode="url"
                  value={linkDraft}
                  autoFocus
                  onChange={(event) => {
                    setLinkDraft(event.target.value);
                    setLinkError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      attachLink();
                    }
                    if (event.key === "Escape") closeLink();
                  }}
                  placeholder="https://a-page-you-like-the-look-of.com"
                  aria-label="Link to attach"
                  className="w-full rounded-lg border border-mist-200 px-3 py-2 text-[13px] text-plum-950 outline-none placeholder:text-slate-550 focus:border-wine-500"
                />
                {/* Under the field it belongs to, not in the shared error box at
                    the bottom of the pane. */}
                {linkError && <p className="text-[12px] text-red-700">{linkError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={attachLink} disabled={busy}>
                    Add
                  </Button>
                  <Button variant="ghost" size="sm" onClick={closeLink}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {attachments.length > 0 && (
              <ul className="mt-2 space-y-1">
                {attachments.map((item, index) => (
                  <li
                    key={`${item.url}-${index}`}
                    className="flex items-center gap-2 rounded-lg bg-mist-50 px-2 py-1.5 text-[12px]"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-600">{item.label}</span>
                    <button
                      type="button"
                      onClick={() => setAttachments((all) => all.filter((_, i) => i !== index))}
                      className="shrink-0 font-semibold text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <ErrorNote error={error} />}

          <div className="mt-auto space-y-2 pt-2">
            <Button
              size="lg"
              className="w-full"
              disabled={busy || comment.trim() === ""}
              onClick={() => void save()}
            >
              {busy ? "Saving" : "Save note"}
            </Button>
            {comment.trim() === "" && (
              <p className="text-center text-[11px] leading-relaxed text-slate-600">
                A drawing on its own is a guess. Say what should be different and
                Save turns on.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

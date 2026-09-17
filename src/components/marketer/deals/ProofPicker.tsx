"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { ApiError, api } from "@/lib/admin/client";
import type { UploadResponse } from "@/lib/marketer/api";
import { IconPhoto } from "../icons3d";
import { Button, ErrorNote, Field, Note } from "../ui";

/** The server's own cap on `proof`, for a new deal and for a resubmit alike. */
export const MAX_PROOF = 5;

export function toApiError(err: unknown): ApiError {
  return err instanceof ApiError
    ? err
    : new ApiError(0, { error: "upstream_failed", detail: String(err) });
}

export interface ProofItem {
  /** Not the URL: two uploads can come back with the same address. */
  key: string;
  url: string;
  /** Added on this screen, as opposed to already on the deal. */
  fresh: boolean;
}

export interface ProofUploads {
  items: ProofItem[];
  urls: string[];
  sending: { done: number; total: number } | null;
  error: ApiError | null;
  add: (files: FileList | null) => Promise<void>;
  remove: (key: string) => void;
}

export function useProofUploads(initial: readonly string[] = []): ProofUploads {
  const [items, setItems] = useState<ProofItem[]>(() =>
    initial.map((url, index) => ({ key: `was-${index}`, url, fresh: false })),
  );
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const uploaded = useRef(0);

  /** One file at a time, so a failure on the third does not lose the first two. */
  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Read before the first await: the caller clears the input straight after.
    const chosen = Array.from(files).slice(0, MAX_PROOF - items.length);
    if (chosen.length === 0) return;

    setError(null);
    setSending({ done: 0, total: chosen.length });
    for (let index = 0; index < chosen.length; index++) {
      const file = chosen[index];
      if (!file) continue;
      try {
        const form = new FormData();
        form.append("file", file);
        const result = await api.upload<UploadResponse>("/marketing/uploads", form);
        uploaded.current += 1;
        const key = `new-${uploaded.current}`;
        setItems((was) => [...was, { key, url: result.url, fresh: true }]);
        setSending({ done: index + 1, total: chosen.length });
      } catch (err) {
        setError(toApiError(err));
        break;
      }
    }
    setSending(null);
  }

  return {
    items,
    urls: items.map((item) => item.url),
    sending,
    error,
    add,
    remove: (key) => setItems((was) => was.filter((item) => item.key !== key)),
  };
}

/**
 * The photo step: a grid of what will be sent, the camera and the camera roll,
 * and a bar while each photo goes up.
 */
export function ProofPicker({
  uploads,
  label,
  hint,
  error,
  markNew = false,
}: {
  uploads: ProofUploads;
  label: string;
  hint?: string;
  error?: string;
  /** Tag photos added here, for a deal that already had some. */
  markNew?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const { items, sending } = uploads;
  const full = items.length >= MAX_PROOF;
  const empty = items.length === 0 && sending === null;

  const buttons = (
    // `md`, not `lg`: two 52px buttons with icons do not fit side by side at 360px.
    <div className="grid grid-cols-2 gap-2">
      <Button
        variant="secondary"
        size="md"
        disabled={full || sending !== null}
        onClick={() => camera.current?.click()}
      >
        <Camera className="h-[18px] w-[18px] shrink-0" aria-hidden />
        Camera
      </Button>
      <Button
        variant="secondary"
        size="md"
        disabled={full || sending !== null}
        onClick={() => library.current?.click()}
      >
        <ImagePlus className="h-[18px] w-[18px] shrink-0" aria-hidden />
        From phone
      </Button>
    </div>
  );

  return (
    <Field label={label} hint={hint} error={error} as="group">
      {empty ? (
        <div
          className={`rounded-[20px] border border-dashed px-4 pb-4 pt-5 text-center ${
            error ? "border-(color:--m-bad-fg)" : "border-white/15"
          } bg-m-card`}
        >
          <span aria-hidden className="mx-auto mb-2 grid w-fit place-items-center">
            <IconPhoto size={56} />
          </span>
          <p className="text-[14px] font-semibold text-m-text">Add a clear photo</p>
          <p className="mx-auto mb-4 mt-1 max-w-[17rem] text-[13px] leading-relaxed text-m-muted">
            Take one now, or pick a screenshot of the alert from your phone.
          </p>
          {buttons}
        </div>
      ) : (
        <>
          <ul className="grid grid-cols-3 gap-2">
            {items.map((item, index) => (
              <li
                key={item.key}
                className="relative aspect-square overflow-hidden rounded-[14px] bg-m-raised ring-1 ring-white/10"
              >
                <Image
                  src={item.url}
                  alt={`Proof photo ${index + 1}`}
                  fill
                  sizes="(max-width: 30rem) 33vw, 10rem"
                  className="object-cover"
                />
                {markNew && item.fresh && (
                  <span className="m-tone-good absolute bottom-1.5 left-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold">
                    New
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Remove photo ${index + 1}`}
                  onClick={() => uploads.remove(item.key)}
                  className="m-press m-tap m-tap-abs right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white ring-1 ring-white/25"
                >
                  <X className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                </button>
              </li>
            ))}
            {sending && (
              <li
                aria-hidden
                className="m-skel relative aspect-square overflow-hidden rounded-[14px] ring-1 ring-m-line"
              />
            )}
          </ul>

          {sending && (
            <div role="status" className="mt-3">
              <p className="m-num mb-1.5 text-[13px] font-semibold text-m-text">
                Sending photo {Math.min(sending.done + 1, sending.total)} of {sending.total}
              </p>
              {/* The filled part is photos done; the sweep is the one on its way. */}
              <div className="m-prog m-skel">
                <span
                  className="m-prog__fill block"
                  style={{ width: `${Math.round((sending.done / sending.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-3">{buttons}</div>
        </>
      )}

      {/* Cleared after every pick, or choosing the same photo twice fires no change. */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          void uploads.add(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          void uploads.add(event.target.files);
          event.target.value = "";
        }}
      />

      {full && (
        <div className="mt-3">
          <Note>That is five photos, which is the most we take. Remove one to add another.</Note>
        </div>
      )}
      {uploads.error && <ErrorNote error={uploads.error} className="mt-3" />}
    </Field>
  );
}

"use client";

import { useRef, useState } from "react";
import type { ImageRecord } from "@avhomes/contracts";
import { ApiError, api } from "@/lib/admin/client";
import { useAsync } from "@/lib/admin/hooks";
import {
  Button,
  Card,
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
 */
export default function ImagesPage() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<ApiError | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, error, loading, reload } = useAsync<{ items: ImageRecord[]; nextCursor: string | null }>(
    (signal) => api.get<{ items: ImageRecord[]; nextCursor: string | null }>("/admin/images?limit=60", signal),
    [],
  );

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setUploadError(null);
    try {
      // One at a time rather than in parallel: the API sniffs and stores each
      // file, and a browser that fires twenty concurrent multipart posts is how
      // an upload screen produces a rate limit instead of a gallery.
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        form.append("alt", file.name.replace(/\.[^.]+$/, ""));
        await api.upload<{ image: ImageRecord }>("/admin/images", form);
      }
      reload();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(image: ImageRecord) {
    setUploadError(null);
    try {
      await api.del(`/admin/images/${image.id}`);
      reload();
    } catch (err) {
      setUploadError(err instanceof ApiError ? err : new ApiError(0, { error: "upstream_failed", detail: String(err) }));
    }
  }

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
              {busy ? "Uploading" : "Upload images"}
            </Button>
          </>
        }
      />

      {uploadError && (
        <div className="mb-4">
          <ErrorNote error={uploadError} />
        </div>
      )}

      {loading && <Spinner />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && data.items.length === 0 && (
        <EmptyState title="No images yet" hint="PNG, JPEG, GIF and WebP, up to 12MB each." />
      )}

      {data && data.items.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.items.map((image) => (
            <Card key={image.id} className="p-3">
              {/* A plain img: these are already-sized blob URLs on an arbitrary
                  host, and next/image would need a remotePattern per store. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.alt}
                className="aspect-[4/3] w-full rounded-lg object-cover"
                loading="lazy"
              />
              <p className="mt-2 truncate text-xs text-muted-foreground">{image.alt || image.id}</p>
              <p className="text-[11px] text-muted-foreground">
                {image.width}x{image.height} · {Math.round(image.bytes / 1024)}KB
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-blue-600 underline underline-offset-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(image.url);
                    setCopied(image.id);
                    setTimeout(() => setCopied(null), 1500);
                  }}
                >
                  {copied === image.id ? "Copied" : "Copy URL"}
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 underline underline-offset-2"
                  onClick={() => void remove(image)}
                >
                  Delete
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

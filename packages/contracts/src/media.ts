/**
 * What an uploaded file is, read from its URL, and the storage allowance.
 *
 * A listing stores media as bare URL strings, so the kind is recovered from the
 * URL rather than a lookup. Every store we write to keeps the extension (local
 * and blob name the key, Cloudinary appends the format), and Cloudinary also
 * puts `/video/upload/` in the path.
 */

export type MediaKind = "image" | "video";

const VIDEO_EXTENSIONS = ["mp4", "m4v", "webm", "mov"] as const;

export function mediaKind(url: string): MediaKind {
  if (/\/video\/upload\//u.test(url)) return "video";
  const path = url.split(/[?#]/u)[0] ?? "";
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return (VIDEO_EXTENSIONS as readonly string[]).includes(ext) ? "video" : "image";
}

export function isVideoUrl(url: string): boolean {
  return mediaKind(url) === "video";
}

/** GIFs animate only when served untouched, so the image optimiser must skip them. */
export function isAnimatedImageUrl(url: string): boolean {
  const path = url.split(/[?#]/u)[0] ?? "";
  return /\.gif$/iu.test(path) || /\/image\/upload\/.*\.gif$/iu.test(path);
}

/** A still frame for a video. Cloudinary renders one from any video URL; other stores have none. */
export function videoPosterUrl(url: string): string | null {
  if (!/res\.cloudinary\.com\/.*\/video\/upload\//u.test(url)) return null;
  return url.replace(/\.[a-z0-9]+(?=$|[?#])/iu, ".jpg").replace("/video/upload/", "/video/upload/so_0/");
}

/** Per-file ceilings. Videos get more room because a 30 second phone clip is already tens of MB. */
export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024;

/** The allowance a site starts with before anybody raises it. */
export const DEFAULT_MEDIA_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;

export const QUOTA_REQUEST_STATUSES = ["pending", "approved", "declined"] as const;
export type QuotaRequestStatus = (typeof QUOTA_REQUEST_STATUSES)[number];

export interface QuotaRequest {
  id: string;
  requestedBytes: number;
  message: string;
  status: QuotaRequestStatus;
  requestedBy: string;
  requestedByName: string;
  createdAt: number;
  decidedAt: number | null;
  decidedByName: string | null;
}

export interface MediaUsage {
  usedBytes: number;
  limitBytes: number;
  fileCount: number;
  pendingRequest: QuotaRequest | null;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes % 1024 ** 3 === 0 ? 0 : 1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

/* ───────────────────────────── notifications ──────────────────────────── */

export const NOTIFICATION_KINDS = ["quota-request", "note-created", "note-updated", "template-request"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** A console path to open, e.g. `/admin/customize?note=...`. */
  href: string;
  /** The quota request id, for kind `quota-request`, so the inbox can approve inline. */
  subjectId: string | null;
  actorName: string;
  createdAt: number;
  readAt: number | null;
}

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  subjectId?: string | null;
  actorId: string;
  actorName: string;
}

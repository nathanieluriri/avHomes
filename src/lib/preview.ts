import type { Property } from "@avhomes/contracts";

/**
 * The editor's preview sheet and the page in its frame talk by postMessage,
 * same origin only. These are the only messages either side accepts.
 */
export const PREVIEW_PATH = "/preview/listing";

export type PreviewView = "grid" | "detail";

export type PreviewMessage =
  /** Frame to editor: mounted, send the listing. */
  | { type: "avhomes-preview:ready" }
  /** Editor to frame: the draft, sent again on every edit. */
  | { type: "avhomes-preview:draft"; property: Property }
  /** Either way: which screen the frame shows. */
  | { type: "avhomes-preview:view"; view: PreviewView };

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as { type?: unknown }).type === "string" &&
    (data as { type: string }).type.startsWith("avhomes-preview:")
  );
}

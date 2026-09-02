import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { NotImplementedError, UpstreamError } from "@avhomes/core";
import type { StoragePort } from "./storage";

/**
 * Local filesystem storage, for development.
 *
 * DEV ONLY, and the constraint is the platform's, not a preference: a Vercel
 * function's filesystem is read only apart from /tmp, and /tmp is per instance
 * and vanishes, so an upload written there is invisible to the next request.
 * Anything deployed needs the blob adapter.
 *
 * Files are served back through `GET /api/public/images/:file` rather than by
 * dropping them in `public/`. Two reasons: `public/` is snapshotted at build
 * time so a runtime write there is not served anyway, and an upload directory
 * inside the source tree is one `git add` away from committing whatever
 * somebody dragged into the admin.
 */

/** Written by `put`, read back by `read`. Never contains a path separator. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

export function localFileStorage(directory: string, urlPrefix: string): StoragePort {
  // Resolved once, against the process working directory, so every later join
  // is against a known absolute base rather than whatever cwd happens to be.
  const root = isAbsolute(directory) ? directory : resolve(process.cwd(), directory);

  /**
   * The containment check.
   *
   * The name is already shape-checked, so `..` cannot appear. This re-derives
   * the absolute path anyway and refuses anything that escaped, because a
   * traversal here reads arbitrary files off the machine and one regex is a
   * thin thing to rest that on.
   */
  function safeJoin(name: string): string | null {
    if (!SAFE_NAME.test(name)) return null;
    const full = resolve(root, name);
    if (full !== join(root, name)) return null;
    return full;
  }

  return {
    assertConfigured() {
      if (directory.trim() === "") {
        throw new NotImplementedError(
          "image-storage",
          "set IMAGE_LOCAL_DIR, or set IMAGE_STORAGE=blob with BLOB_READ_WRITE_TOKEN",
        );
      }
    },

    async put(key, body, contentType) {
      // `put` is handed `images/<id>.<ext>`; only the last segment is kept, so
      // the caller's key shape cannot create directories here.
      const name = key.split("/").pop() ?? key;
      const full = safeJoin(name);
      if (!full) {
        throw new UpstreamError("local-storage", `refusing to write an unsafe filename: ${name}`);
      }
      try {
        await mkdir(root, { recursive: true });
        await writeFile(full, new Uint8Array(body));
      } catch (err) {
        throw new UpstreamError(
          "local-storage",
          `could not write to ${root}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return {
        url: `${urlPrefix}/${name}`,
        pathname: name,
        bytes: body.byteLength,
        contentType,
      };
    },

    async read(pathname) {
      const full = safeJoin(pathname);
      if (!full) return null;
      try {
        const buffer = await readFile(full);
        // Copies out of Node's shared buffer pool. See StoredFile.body.
        const body = new Uint8Array(buffer).buffer;
        return { body, contentType: contentTypeFor(pathname) };
      } catch {
        // An absent file is an answer, not an incident: the row may have been
        // deleted, or the directory wiped between runs.
        return null;
      }
    },

    async remove(pathname) {
      const full = safeJoin(pathname);
      if (!full) return;
      try {
        await unlink(full);
      } catch {
        // Already gone is the outcome the caller asked for.
      }
    },
  };
}

/**
 * From the extension, which `put` derived from the SNIFFED type rather than
 * from anything a caller sent. Falls back to a type no browser will execute.
 */
function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

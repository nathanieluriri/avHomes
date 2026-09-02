import { NotImplementedError, UpstreamError, getEnv } from "@avhomes/core";

/**
 * Object storage as a PORT.
 *
 * The default THROWS on every call rather than succeeding quietly. A storage
 * adapter that pretends to work is how an upload feature ships, passes review,
 * and serves broken images from the day it is deployed.
 */
export interface StoredObject {
  url: string;
  pathname: string;
  bytes: number;
  contentType: string;
}

export interface StoragePort {
  assertConfigured(): void;
  put(key: string, body: ArrayBuffer, contentType: string): Promise<StoredObject>;
  remove(pathname: string): Promise<void>;
}

export function unconfiguredStorage(): StoragePort {
  const fail = (): never => {
    throw new NotImplementedError(
      "image-storage",
      "set BLOB_READ_WRITE_TOKEN (Vercel dashboard, Storage, Blob)",
    );
  };
  return { assertConfigured: fail, put: fail, remove: fail };
}

/**
 * Vercel Blob.
 *
 * `@vercel/blob` is imported lazily so a deployment without a blob store never
 * loads it, and so importing this module demands no configuration. The token is
 * read at CALL time for the same reason.
 */
export function vercelBlobStorage(): StoragePort {
  function token(): string {
    const value = getEnv().BLOB_READ_WRITE_TOKEN;
    if (value === "") {
      throw new NotImplementedError(
        "image-storage",
        "set BLOB_READ_WRITE_TOKEN (Vercel dashboard, Storage, Blob)",
      );
    }
    return value;
  }

  return {
    assertConfigured() {
      token();
    },

    async put(key, body, contentType) {
      const auth = token();
      try {
        const { put } = await import("@vercel/blob");
        const result = await put(key, body, {
          access: "public",
          contentType,
          token: auth,
          // The key already carries a unique id, so a random suffix would only
          // make the stored name differ from the one in our own document.
          addRandomSuffix: false,
        });
        return {
          url: result.url,
          pathname: result.pathname,
          bytes: body.byteLength,
          contentType,
        };
      } catch (err) {
        throw new UpstreamError("vercel-blob", err instanceof Error ? err.message : String(err));
      }
    },

    async remove(pathname) {
      const auth = token();
      try {
        const { del } = await import("@vercel/blob");
        await del(pathname, { token: auth });
      } catch (err) {
        throw new UpstreamError("vercel-blob", err instanceof Error ? err.message : String(err));
      }
    },
  };
}

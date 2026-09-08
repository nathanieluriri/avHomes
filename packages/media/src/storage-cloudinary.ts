import { NotImplementedError, UpstreamError, getEnv } from "@avhomes/core";
import type { StoragePort, StoredObject } from "./storage";

/**
 * Cloudinary.
 *
 * A CDN store, so it implements `put` and `remove` and NOT `read`: the browser
 * fetches `secure_url` directly and this application never touches the bytes
 * again. The absence of `read` is what keeps the public image route dark, which
 * is the switch documented on `StoragePort`.
 *
 * ONE VARIABLE, `CLOUDINARY_URL`, rather than three. The SDK reads that format
 * (`cloudinary://<api_key>:<api_secret>@<cloud_name>`) by itself, it is the
 * single string the Cloudinary dashboard hands you, and three separate values
 * are three chances to paste one of them into the wrong field. It is checked
 * here anyway rather than left to the SDK, because the SDK's own failure for a
 * missing cloud name is a TypeError deep in a request, not a sentence naming
 * what to set.
 *
 * The module is imported LAZILY inside each call, for the same reason the blob
 * adapter does it: importing this file must not demand configuration, so a
 * deployment storing images somewhere else never loads the SDK at all.
 */
export function cloudinaryStorage(): StoragePort {
  function assertUrl(): string {
    const value = getEnv().CLOUDINARY_URL;
    if (value === "") {
      throw new NotImplementedError(
        "image-storage",
        "set CLOUDINARY_URL (Cloudinary dashboard, Programmable Media, API Keys)",
      );
    }
    return value;
  }

  /*
   * The SDK is configured from `process.env.CLOUDINARY_URL` on import, which is
   * exactly the shape a serverless runtime provides, so there is nothing to
   * pass. `secure: true` is set anyway: the default has flipped between major
   * versions and an http URL stored in a document is a mixed-content image on
   * every page that later renders it.
   */
  async function sdk() {
    assertUrl();
    const { v2 } = await import("cloudinary");
    v2.config({ secure: true });
    return v2;
  }

  return {
    assertConfigured() {
      assertUrl();
    },

    async put(key, body, contentType): Promise<StoredObject> {
      const cloudinary = await sdk();

      /*
       * Cloudinary appends the format itself, so the public id is the key with
       * its extension removed. Keeping the caller's `images/img_...` path means
       * the id in Cloudinary matches the id in our own document, which is what
       * makes an orphan findable by hand later.
       */
      const publicId = key.replace(/\.[^./]+$/, "");

      try {
        const result = await new Promise<{
          public_id: string;
          secure_url: string;
          bytes: number;
        }>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            {
              public_id: publicId,
              resource_type: "image",
              // The bytes are already sniffed and the id is already unique, so
              // neither a format guess nor a random suffix would add anything,
              // and a suffix would make the stored name differ from ours.
              unique_filename: false,
              overwrite: false,
            },
            (error, uploaded) => {
              if (error) return reject(error);
              if (!uploaded) return reject(new Error("no upload result"));
              resolve(uploaded as { public_id: string; secure_url: string; bytes: number });
            },
          );
          stream.end(Buffer.from(body));
        });

        return {
          url: result.secure_url,
          // The public id, NOT a path. It is what `remove` needs, and this field
          // is the only thing carried into the document for that purpose.
          pathname: result.public_id,
          bytes: result.bytes ?? body.byteLength,
          contentType,
        };
      } catch (err) {
        throw new UpstreamError("cloudinary", err instanceof Error ? err.message : String(err));
      }
    },

    async remove(pathname) {
      const cloudinary = await sdk();
      try {
        // `invalidate` purges the CDN copy as well as the stored original.
        // Without it a deleted photo keeps being served from an edge for
        // minutes to hours, which on a listing that was taken down reads as the
        // delete having silently failed.
        await cloudinary.uploader.destroy(pathname, { invalidate: true });
      } catch (err) {
        throw new UpstreamError("cloudinary", err instanceof Error ? err.message : String(err));
      }
    },
  };
}

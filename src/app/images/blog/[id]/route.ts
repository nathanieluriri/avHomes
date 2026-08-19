import { BLOG_API } from "@/lib/blog/config";

/**
 * Same origin image proxy.
 *
 * Upstream /api/public/images/<id> answers with a 302 to a presigned R2 URL
 * that carries "private, no-store" and expires in about 300s. The presigned
 * target differs on every presign, so neither leg can ever be cached and the
 * credential inside it must never reach HTML. This route follows the redirect
 * server side and serves the bytes from a URL that never changes.
 */

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  if (!ID_PATTERN.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const cacheKey = new Request(
    `https://images.internal/blog/${id}`,
    { method: "GET" }
  );

  // caches.default is absent in next dev and a documented no-op on
  // workers.dev, so a broken cache must never break the image.
  let edgeCache: Cache | undefined;
  try {
    const store = (globalThis as { caches?: { default?: Cache } }).caches;
    edgeCache = store?.default;
    if (edgeCache) {
      const hit = await edgeCache.match(cacheKey);
      if (hit) return hit;
    }
  } catch {
    edgeCache = undefined;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${BLOG_API}/images/${id}`, { redirect: "follow" });
  } catch {
    return new Response("Upstream unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!upstream.ok) {
    // Short cache so a probed id cannot drive a request per view upstream.
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  }

  // Buffered because the edge cache needs a second read, and a cover image
  // fits comfortably in Worker memory.
  const body = await upstream.arrayBuffer();

  const response = new Response(body, {
    status: 200,
    headers: {
      // Safe as immutable: an image id names one committed upload, so
      // replacing a cover produces a new id. Freshness rides on the HTML's
      // ISR window, not on this URL.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    },
  });

  try {
    await edgeCache?.put(cacheKey, response.clone());
  } catch {
    // A cache write failure is not worth failing the image over.
  }

  return response;
}

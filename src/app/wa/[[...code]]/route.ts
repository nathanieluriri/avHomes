import { app } from "@avhomes/api";

/*
 * A partner's short link to the WhatsApp group. Not a next.config rewrite: a
 * rewrite keeps the original URL on the request, so the API saw /wa/... and
 * matched nothing. Every API router registers under /api.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request): Response | Promise<Response> {
  const url = new URL(req.url);
  url.pathname = `/api${url.pathname}`;
  return app.fetch(new Request(url, req));
}

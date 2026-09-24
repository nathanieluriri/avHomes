import { NotImplementedError, UpstreamError } from "./errors";
import type { Mailer, MailMessage } from "./mail";

/**
 * The Hostinger Mail API, over fetch.
 *
 * It is a mailbox API, not a bulk sender: one token is scoped to one Hostinger
 * email order, sees the mailboxes that order holds, and can read, file and send
 * as any of them. It has no endpoint for creating or deleting a mailbox, for
 * passwords, aliases or forwarders; those stay in the Hostinger panel.
 *
 * Reference: https://api.mail.hostinger.com (spec at /openapi/openapi.json).
 */
export const HOSTINGER_MAIL_API = "https://api.mail.hostinger.com/api/v1";

/** A refusal from Hostinger, with its own status and `ERR_*` code. */
export class HostingerError extends Error {
  override readonly name = "HostingerError";
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Sending can take a while upstream; Hostinger itself answers 504 past its own limit. */
  timeoutMs?: number;
}

function url(path: string, query?: RequestOptions["query"]): string {
  const out = new URL(`${HOSTINGER_MAIL_API}${path}`);
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") out.searchParams.set(name, String(value));
  }
  return out.toString();
}

/** The raw response, for the one caller that streams bytes (attachments). */
export async function hostingerFetch(
  key: string,
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url(path, options.query), {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });
  } catch (err) {
    throw new UpstreamError("hostinger", err instanceof Error ? err.message : "network failure");
  }
  if (!res.ok) {
    // `{ error, code, params }` on every 4xx and 5xx. `error` is written for people.
    const body = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
    throw new HostingerError(
      res.status,
      typeof body?.code === "string" ? body.code : `HTTP_${res.status}`,
      typeof body?.error === "string" ? body.error.slice(0, 300) : `Hostinger answered ${res.status}.`,
    );
  }
  return res;
}

/** JSON in, the unwrapped `data` out. Null for a 204. */
export async function hostingerRequest<T>(
  key: string,
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T | null> {
  const res = await hostingerFetch(key, method, path, options);
  if (res.status === 204) return null;
  const body = (await res.json().catch(() => null)) as { data?: T } | null;
  return body?.data ?? null;
}

/** Paginated lists carry `pagination` beside `data`. */
export async function hostingerPage<T>(
  key: string,
  path: string,
  query: RequestOptions["query"] = {},
  init: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<{ data: T[]; page: number; totalPages: number; total: number }> {
  const res = await hostingerFetch(key, init.method ?? "GET", path, { query, body: init.body });
  const body = (await res.json().catch(() => null)) as {
    data?: T[];
    pagination?: { page?: number; totalPages?: number; total?: number };
  } | null;
  const data = body?.data ?? [];
  return {
    data,
    page: body?.pagination?.page ?? 1,
    totalPages: body?.pagination?.totalPages ?? 1,
    total: body?.pagination?.total ?? data.length,
  };
}

export interface HostingerMailbox {
  resourceId: string;
  address: string;
}

/** The token's own view: which order, and which mailboxes it may act as. */
export async function hostingerAccount(
  key: string,
): Promise<{ orderResourceId: string; mailboxes: HostingerMailbox[] }> {
  const data = await hostingerRequest<{ orderResourceId?: string; mailboxes?: HostingerMailbox[] }>(
    key,
    "GET",
    "/me",
  );
  return { orderResourceId: data?.orderResourceId ?? "", mailboxes: data?.mailboxes ?? [] };
}

/** Who a message goes out as. */
export interface HostingerSender {
  key: string;
  mailboxId: string;
  address: string;
  displayName: string;
}

const NOT_SET_HINT =
  "paste a Hostinger API key under Settings, Email delivery, or set RESEND_API_KEY and MAIL_FROM";

/**
 * The Mailer port over a Hostinger mailbox.
 *
 * The sender is RESOLVED per send, because it lives in settings an admin can
 * change at any moment. `resolve` is expected to cache.
 *
 * Hostinger's send takes no Reply-To and no custom headers, so `replyTo` and
 * `headers` are dropped here. `mailerWithFallback` routes messages that need
 * them to Resend when Resend is configured.
 */
export function hostingerMailer(resolve: () => Promise<HostingerSender | null>): Mailer {
  async function sender(): Promise<HostingerSender> {
    const found = await resolve();
    if (!found) throw new NotImplementedError("mail", NOT_SET_HINT);
    return found;
  }

  return {
    async assertConfigured() {
      await sender();
    },
    async send(message) {
      const from = await sender();
      try {
        await hostingerRequest(from.key, "POST", `/mailboxes/${encodeURIComponent(from.mailboxId)}/send`, {
          body: {
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
            ...(from.displayName ? { displayName: from.displayName } : {}),
          },
          timeoutMs: 45_000,
        });
      } catch (err) {
        if (err instanceof HostingerError) {
          throw new UpstreamError("hostinger", `${err.status} ${err.code} ${err.message}`);
        }
        throw err;
      }
    },
  };
}

async function ready(mailer: Mailer): Promise<boolean> {
  try {
    await mailer.assertConfigured();
    return true;
  } catch {
    return false;
  }
}

/** Reply-To and List-Unsubscribe are the two things only Resend can carry. */
function needsFallback(message: MailMessage): boolean {
  return message.replyTo !== undefined || message.headers !== undefined;
}

/**
 * The primary when it is configured, the fallback otherwise.
 *
 * One exception: a message that needs a Reply-To or its own headers goes to the
 * fallback when the fallback is configured, because the primary would silently
 * drop them. With no fallback it still goes, without them.
 */
export function mailerWithFallback(primary: Mailer, fallback: Mailer): Mailer {
  async function pick(message: MailMessage): Promise<Mailer> {
    if (!(await ready(primary))) return fallback;
    if (needsFallback(message) && (await ready(fallback))) return fallback;
    return primary;
  }

  return {
    async assertConfigured() {
      if (await ready(primary)) return;
      if (await ready(fallback)) return;
      throw new NotImplementedError("mail", NOT_SET_HINT);
    },
    async send(message) {
      await (await pick(message)).send(message);
    },
    async sendBatch(messages) {
      const viaFallback: MailMessage[] = [];
      const viaPrimary: MailMessage[] = [];
      for (const message of messages) {
        ((await pick(message)) === fallback ? viaFallback : viaPrimary).push(message);
      }
      if (viaFallback.length > 0) {
        if (fallback.sendBatch) await fallback.sendBatch(viaFallback);
        else for (const message of viaFallback) await fallback.send(message);
      }
      // Hostinger has no batch endpoint, so one request per message, in order.
      let failed = 0;
      let last: unknown = null;
      for (const message of viaPrimary) {
        try {
          await primary.send(message);
        } catch (err) {
          failed += 1;
          last = err;
        }
      }
      if (failed > 0) {
        const reason = last instanceof Error ? last.message : String(last);
        throw new UpstreamError("mail", `${failed} of ${viaPrimary.length} failed: ${reason.slice(0, 200)}`);
      }
    },
  };
}

/**
 * The admin's API client.
 *
 * One request function, so the error envelope, the credentials mode and the
 * status table are decided once. Every screen throws and catches the same
 * `ApiError`, which carries everything the server's error table put in the body
 * INCLUDING the requestId, so a report from an operator can be matched to a log
 * line without asking them to reproduce anything.
 */

export interface ApiIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: string;
  requestId?: string;
  detail?: string;
  issues?: ApiIssue[];
  reason?: string;
  operation?: string;
  feature?: string;
  hint?: string;
  field?: string;
  expected?: number;
  actual?: number;
  path?: string;
  retryAfter?: number;
  debug?: { name: string; message: string; at: string; stack: string[] };
  [key: string]: unknown;
}

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error ?? `HTTP ${status}`);
  }

  /**
   * The sentence to put in front of a person.
   *
   * Server-supplied `detail` wins, because a route that took the trouble to
   * explain a refusal knows more than this table does. Everything else falls
   * back to a phrasing that says what to DO, not what went wrong internally.
   */
  get message(): string {
    const b = this.body;
    if (typeof b.detail === "string" && b.detail !== "") return b.detail;
    switch (b.error) {
      case "unauthenticated":
        return "Your session has ended. Sign in again.";
      case "forbidden":
        return b.reason ?? "You do not have access to this.";
      case "gone":
        return "That no longer exists.";
      case "bad_request":
        return b.issues?.length
          ? `Check ${b.issues.map((i) => i.path).join(", ")}.`
          : "That request was not accepted.";
      case "invalid_document":
        return `The document is not valid at ${b.path ?? "an unknown position"}.`;
      case "stale_write":
        return "Someone else saved this while you were editing.";
      case "precondition_failed":
        return `That is not allowed right now (${b.operation ?? "refused"}).`;
      case "duplicate":
        return `That ${b.field ?? "value"} is already taken.`;
      case "rate_limited":
        return `Too many attempts. Try again in ${b.retryAfter ?? 60}s.`;
      case "not_implemented":
        return b.hint ? `Not configured: ${b.hint}` : "That feature is not configured.";
      case "upstream_failed":
        return "A service we depend on is not answering.";
      default:
        return "Something went wrong.";
    }
  }

  /** For a copy-to-clipboard button on an error toast. */
  get diagnostic(): string {
    return [
      `${this.status} ${this.body.error}`,
      this.body.requestId ? `requestId ${this.body.requestId}` : "",
      this.body.debug?.at ?? "",
      this.body.debug?.message ?? "",
    ]
      .filter(Boolean)
      .join(" | ");
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  /** For multipart uploads, which must not be JSON-encoded. */
  form?: FormData;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, form } = options;

  const init: RequestInit = {
    method,
    // Same origin, so the session cookie rides along by default. Stated anyway,
    // because "it worked until someone moved the admin to another host" is a
    // failure mode worth one word of insurance.
    credentials: "same-origin",
    signal: signal ?? null,
    headers: {},
  };

  if (form) {
    init.body = form;
    // Deliberately NOT setting content-type: the browser has to add the
    // multipart boundary itself, and setting it by hand omits that boundary and
    // produces a body the server cannot parse.
  } else if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, init);

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text === "" ? {} : JSON.parse(text);
  } catch {
    // A non-JSON body from our own API means something upstream of the router
    // answered: a platform 404, a 405, a gateway timeout. Naming it that way is
    // more useful than "unexpected token".
    throw new ApiError(res.status, {
      error: "upstream_failed",
      detail: `The server answered ${res.status} with a non-JSON body. This usually means the request never reached the API router.`,
    });
  }

  if (!res.ok) throw new ApiError(res.status, parsed as ApiErrorBody);
  return parsed as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiFetch<T>(path, { signal: signal ?? undefined }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, form: FormData) => apiFetch<T>(path, { method: "POST", form }),
};

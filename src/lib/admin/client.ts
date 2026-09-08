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

/**
 * The sentence to put in front of a person.
 *
 * Server-supplied `detail` wins, because a route that took the trouble to
 * explain a refusal knows more than this table does. Everything else falls back
 * to a phrasing that says what to DO, not what went wrong internally.
 *
 * A FREE FUNCTION, CALLED BEFORE `super()`, and that is the whole point of its
 * shape. This used to be a `get message()` on the class, and it never ran once:
 * `super(...)` makes `Error` install `message` as an OWN data property on the
 * instance, and an own property shadows a prototype accessor. So every screen
 * in the console printed the raw code (`bad_request`, `forbidden`,
 * `upstream_failed`) where its sentence was meant to go, and `ErrorNote` drew
 * that token as its headline directly above the same token in its status chip.
 * Twelve written sentences, dead from the day they were added.
 */
function sentenceFor(status: number, b: ApiErrorBody): string {
  if (typeof b.detail === "string" && b.detail !== "") return b.detail;
  switch (b.error) {
    case "unauthenticated":
      return "Your session has ended. Sign in again.";
    case "forbidden":
      return b.reason ?? "You do not have access to this.";
    case "gone":
      return "That no longer exists.";
    case "bad_request":
      // Capped at three, because this sentence is the headline of `ErrorNote`
      // and a field path has no spaces in it. Eight of them joined by commas is
      // one unbreakable token wider than a 288px card, which pushes the whole
      // console into horizontal scroll on a phone. The full list is still drawn
      // as a bulleted breakdown underneath.
      return b.issues?.length
        ? `Check ${b.issues
            .slice(0, 3)
            .map((i) => i.path)
            .join(", ")}${b.issues.length > 3 ? ` and ${b.issues.length - 3} more` : ""}.`
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
      return status >= 500 ? "The server could not answer that." : "Something went wrong.";
  }
}

export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(sentenceFor(status, body));
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
  /** Milliseconds before the request is abandoned. 0 disables it. */
  timeoutMs?: number;
}

/**
 * A request that gives up.
 *
 * Written for the mobile radio that ATTACHES BUT CARRIES NOTHING: a lift, a
 * basement, a handover between masts. `fetch` has no timeout of its own, so
 * that state does not fail, it hangs, and a screen sits on its skeleton
 * forever with no error and no retry. Twenty seconds is long enough that a slow
 * but working connection is never cut off and short enough that a dead one is
 * reported while the operator is still looking at the screen.
 *
 * Uploads opt out by passing 0. A photo taken on the phone is several megabytes
 * over cellular, and a timeout there would cancel work that is progressing
 * perfectly well.
 */
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * The timeout signal, and the caller's, as one signal.
 *
 * HAND-ROLLED RATHER THAN `AbortSignal.any`, and the reason is the entire point
 * of this file's mobile pass. `AbortSignal.any` shipped in Safari 17.4 and
 * `AbortSignal.timeout` in Safari 16.0, both well after the iPhones an estate
 * agent is actually carrying. Calling either unguarded throws a synchronous
 * TypeError before the try/catch around `fetch`, and since every `useAsync`
 * read passes a signal, that would mean the console failing to load ANY screen
 * on iOS 16 through 17.3 while working perfectly on the desktop it was tested
 * on. A twenty second timeout is not worth a blank app on a two year old phone.
 *
 * The manual controller aborts with a `TimeoutError`, the same name the native
 * signal uses, so the branch that turns it into a sentence does not care which
 * path produced it.
 */
function composeSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  if (timeoutMs <= 0) return { signal: signal ?? null, done: () => {} };

  if (typeof AbortSignal.timeout === "function" && typeof AbortSignal.any === "function") {
    const timeout = AbortSignal.timeout(timeoutMs);
    return {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      done: () => {},
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("The request timed out.", "TimeoutError")),
    timeoutMs,
  );
  // The caller's abort has to reach the controller by hand, or unmounting a
  // component would leave the request running until the timer fires.
  const forward = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) forward();
    else signal.addEventListener("abort", forward, { once: true });
  }

  return {
    signal: controller.signal,
    // Called whatever the outcome, so a resolved request does not hold a timer
    // and a listener on the caller's signal for the rest of its life.
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    },
  };
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, form, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const composed = composeSignal(signal, timeoutMs);

  const init: RequestInit = {
    method,
    // Same origin, so the session cookie rides along by default. Stated anyway,
    // because "it worked until someone moved the admin to another host" is a
    // failure mode worth one word of insurance.
    credentials: "same-origin",
    signal: composed.signal,
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

  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch (err) {
    composed.done();
    // Told apart from a component unmounting, which aborts the caller's signal
    // and is not a failure to report. A timeout is, and it needs a sentence
    // that names the connection rather than blaming the server.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, {
        error: "upstream_failed",
        detail: "The connection is not answering. Check your signal and try again.",
      });
    }
    throw err;
  }
  composed.done();

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
  // No timeout. A photo straight off a phone camera is several megabytes over
  // cellular, and cutting that off at twenty seconds would cancel an upload
  // that is progressing perfectly well.
  upload: <T>(path: string, form: FormData) =>
    apiFetch<T>(path, { method: "POST", form, timeoutMs: 0 }),
};

import { Hono } from "hono";
import { z } from "zod";
import { COLLECTIONS, collection, type Db } from "@avhomes/db";
import {
  BadRequestError,
  NotFoundError,
  StaleWriteError,
  clampLimit,
  clientIp,
  currentDb,
  currentUser,
  email,
  getEnv,
  keysetFilter,
  keysetSort,
  newId,
  pathParam,
  readJson,
  readQuery,
  siteOrigin,
  str,
  takePage,
  trySend,
  type AppEnv,
  type Mailer,
  type SortSpec,
} from "@avhomes/core";
import {
  ENQUIRY_STATUSES,
  type Enquiry,
  type EnquiryChannel,
  type EnquiryMessage,
  type EnquiryStatus,
  type EnquiryThread,
} from "@avhomes/contracts";
import {
  CHAT_MAX_BODY,
  CHAT_MAX_MESSAGES,
  CHAT_MESSAGE_IP_LIMIT,
  CHAT_MESSAGE_WINDOW_MS,
  ENQUIRY_IP_LIMIT,
  ENQUIRY_WINDOW_MS,
  limit,
  mintSessionToken,
  requireAuth,
  tokenId,
} from "@avhomes/identity";
import { readSettings, replySignature } from "./settings";

/**
 * @avhomes/enquiries
 *
 * The contact form's intake, the live chat behind "Contact agent", and the inbox
 * that works both.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A CHAT THREAD IS AN ENQUIRY, NOT A SECOND THING.
 *
 * Both channels land in one collection with one status, so the inbox has ONE
 * unread count and one place to miss a message. The alternative, a `chats`
 * collection beside `enquiries`, means every screen that answers "has anyone
 * replied to this buyer" has to ask twice and reconcile the answers, and the
 * first time somebody forgets the second question a customer waits a week.
 *
 * The messages are EMBEDDED in the enquiry document rather than kept in their
 * own collection. A thread is always read whole, is bounded by
 * `CHAT_MAX_MESSAGES`, and the enquiry's `revision` is then a CAS token over the
 * conversation as well as over the status, so two agents answering at once
 * cannot interleave into a transcript neither of them wrote.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE VISITOR HAS NO ACCOUNT. They hold a bearer token minted when the thread
 * opened, and the document stores only its HMAC, exactly as sessions do. So a
 * database dump yields thread ids, and an id is not a token.
 */

interface EnquiryMessageDoc {
  id: string;
  from: "visitor" | "agent";
  body: string;
  createdAt: number;
  /** The account that wrote an agent message. Null for a visitor's. */
  authorId: string | null;
  /** Snapshot of the name the visitor was shown. See `replySignature`. */
  authorName: string;
}

interface EnquiryDoc {
  _id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  channel: EnquiryChannel;
  messages: EnquiryMessageDoc[];
  /**
   * HMAC of the visitor's resume token, under SESSION_SECRET. Null on a form
   * enquiry, which has no thread to resume. NEVER returned on the wire.
   */
  threadKey: string | null;
  propertyId: string | null;
  propertySlug: string | null;
  propertyTitle: string | null;
  status: EnquiryStatus;
  createdAt: number;
  updatedAt: number;
  lastVisitorAt: number | null;
  lastAgentAt: number | null;
  handledBy: string | null;
  note: string | null;
  /** Kept for abuse triage. NEVER returned on the wire. */
  sourceIp: string | null;
  revision: number;
}

/**
 * The inbox row. Enumerated, so `sourceIp` and `threadKey` cannot arrive in a
 * response, and DELIBERATELY WITHOUT THE TRANSCRIPT: a hundred threads of three
 * hundred messages each is a response measured in megabytes, for a screen that
 * renders one line per row.
 *
 * The narrow one is the BASE and the detail projection adds to it. The obvious
 * shape, spreading the full projection and setting `messages: 0`, is what shipped
 * first and it is not a projection at all: MongoDB refuses to mix an exclusion
 * into an inclusion (the only field allowed both ways is `_id`), so every load of
 * the inbox answered "Cannot do exclusion on field messages in inclusion
 * projection" as a 500. Building narrow-to-wide makes that mistake unexpressible.
 */
const LIST_PROJECTION = {
  _id: 1,
  name: 1,
  email: 1,
  phone: 1,
  message: 1,
  channel: 1,
  propertyId: 1,
  propertySlug: 1,
  propertyTitle: 1,
  status: 1,
  createdAt: 1,
  updatedAt: 1,
  lastVisitorAt: 1,
  lastAgentAt: 1,
  handledBy: 1,
  note: 1,
  revision: 1,
} as const;

/** The detail read, which is the only one that wants the conversation. */
const WIRE_PROJECTION = { ...LIST_PROJECTION, messages: 1 } as const;

const SORT: SortSpec = { field: "createdAt", direction: -1 };
const SORT_NAME = "newest";

function enquiries(db: Db) {
  return collection<EnquiryDoc>(db, COLLECTIONS.enquiries);
}

function toMessage(doc: EnquiryMessageDoc): EnquiryMessage {
  return { id: doc.id, from: doc.from, body: doc.body, createdAt: doc.createdAt, authorName: doc.authorName };
}

function toEnquiry(doc: EnquiryDoc, handlerName: string | null): Enquiry {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    message: doc.message,
    // Coalesced, because every row written before the chat existed has neither.
    channel: doc.channel ?? "form",
    messages: (doc.messages ?? []).map(toMessage),
    propertyId: doc.propertyId,
    propertySlug: doc.propertySlug,
    propertyTitle: doc.propertyTitle ?? null,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastVisitorAt: doc.lastVisitorAt ?? null,
    lastAgentAt: doc.lastAgentAt ?? null,
    handledBy: doc.handledBy,
    handledByName: handlerName,
    note: doc.note,
    revision: doc.revision,
  };
}

async function handlerNames(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const real = ids.filter((id): id is string => id !== null);
  if (real.length === 0) return new Map();
  const rows = await collection<{ _id: string; displayName: string }>(db, COLLECTIONS.users)
    .find({ _id: { $in: [...new Set(real)] } }, { projection: { _id: 1, displayName: 1 } })
    .toArray();
  return new Map(rows.map((r) => [r._id, r.displayName]));
}

/* ─────────────────────────── the visitor's view ───────────────────────── */

/**
 * What the buyer is allowed to see of their own thread.
 *
 * Built by NAMING FIELDS rather than by deleting them from the admin shape.
 * `note` is an internal remark about the person reading this, `handledBy` is an
 * account id, and a projection that starts from everything and subtracts leaks
 * the next field somebody adds.
 */
async function toThread(db: Db, doc: EnquiryDoc): Promise<EnquiryThread> {
  const messages = (doc.messages ?? []).map(toMessage);
  // The face belongs to whoever last answered, resolved live so an agent who
  // uploads a photo mid-conversation stops being a blank circle.
  const agent = doc.handledBy
    ? await collection<{ _id: string; displayName: string; avatarUrl?: string | null }>(
        db,
        COLLECTIONS.users,
      ).findOne({ _id: doc.handledBy }, { projection: { _id: 1, displayName: 1, avatarUrl: 1 } })
    : null;
  const site = await readSettings(db);
  const signature = agent
    ? replySignature(site, { displayName: agent.displayName, avatarUrl: agent.avatarUrl ?? "" })
    : null;

  return {
    id: doc._id,
    status: doc.status,
    propertyTitle: doc.propertyTitle ?? null,
    messages,
    agentName: signature?.name ?? null,
    agentAvatarUrl: signature?.avatarUrl ?? null,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Loads a thread the caller proved they own, or refuses identically either way.
 *
 * A wrong token and an unknown id both answer 404. Distinguishing them turns the
 * id space into an oracle for which threads exist, and a thread id is in a URL
 * and a localStorage entry, both of which travel.
 */
async function loadOwnedThread(db: Db, id: string, token: string): Promise<EnquiryDoc> {
  if (token.trim() === "") throw new NotFoundError(`thread ${id}`);
  const doc = await enquiries(db).findOne({ _id: id, threadKey: tokenId(token) });
  if (!doc) throw new NotFoundError(`thread ${id}`);
  return doc;
}

/* ──────────────────────────────── mail ────────────────────────────────── */

function transcript(doc: EnquiryDoc): string {
  return (doc.messages ?? [])
    .map((m) => {
      const who = m.from === "visitor" ? doc.name || "You" : m.authorName;
      return `${who} · ${new Date(m.createdAt).toUTCString()}\n${m.body}`;
    })
    .join("\n\n");
}

function propertyLine(doc: EnquiryDoc): string {
  if (!doc.propertySlug) return "";
  return `About: ${doc.propertyTitle ?? doc.propertySlug} (${siteOrigin()}/listings/${doc.propertySlug})`;
}

/**
 * Mails the buyer the whole conversation so far.
 *
 * THE WHOLE THING, not just the new reply, and that is the point of the feature:
 * the thread lives in one browser's storage, so a buyer who answers from their
 * phone, clears their history, or simply closes the tab has no other copy. The
 * mail is the durable one.
 */
async function mailTranscript(
  mailer: Mailer,
  doc: EnquiryDoc,
  ctx: { requestId: string; route: string },
): Promise<void> {
  const subject = doc.propertyTitle
    ? `Your conversation about ${doc.propertyTitle}`
    : "Your conversation with AVHomes";
  await trySend(
    mailer,
    {
      to: doc.email,
      subject,
      text: [
        `Hello ${doc.name || "there"},`,
        "",
        "Here is your conversation with our team so far.",
        propertyLine(doc),
        "",
        "------------------------",
        transcript(doc),
        "------------------------",
        "",
        "Reply to this email and it reaches the same person.",
      ].join("\n"),
    },
    ctx,
  );
}

/**
 * Tells the team a thread moved.
 *
 * Separate from the buyer's copy because the two differ in more than address:
 * this one links into the inbox and carries the buyer's phone number, and
 * sending one message to both audiences is how an internal note reaches a
 * customer.
 */
async function notifyTeam(
  mailer: Mailer,
  doc: EnquiryDoc,
  subject: string,
  ctx: { requestId: string; route: string },
): Promise<void> {
  const notifyTo = getEnv().ENQUIRY_NOTIFY_TO;
  if (notifyTo === "") return;
  const last = (doc.messages ?? []).at(-1);
  await trySend(
    mailer,
    {
      to: notifyTo,
      subject,
      text: [
        `${doc.name} <${doc.email}>${doc.phone ? ` / ${doc.phone}` : ""}`,
        propertyLine(doc),
        "",
        last?.body ?? doc.message,
        "",
        `Open the thread: ${siteOrigin()}/admin/enquiries/${doc._id}`,
      ]
        .filter(Boolean)
        .join("\n"),
      // So hitting reply in a mail client answers the person, not the site.
      replyTo: doc.email,
    },
    ctx,
  );
}

/* ───────────────────────────── public intake ──────────────────────────── */

const SubmitBody = z
  .object({
    name: str().min(1).max(200).trim(),
    email: email(),
    phone: str().max(60).trim().optional(),
    message: str().min(1).max(5000).trim(),
    propertyId: str().max(120).optional(),
    propertySlug: str().max(200).optional(),
    propertyTitle: str().max(300).optional(),
    /**
     * A honeypot. Bots fill every field they find; a human never sees this one,
     * so a non-empty value is a bot and the response is a normal 201 telling it
     * nothing. Refusing loudly just teaches the next attempt.
     */
    website: str().max(200).optional(),
  })
  .strict();

/**
 * The chat opener asks for MORE than the form does.
 *
 * A phone number is optional on the contact form and required here, because the
 * two promise different things. The form promises a reply by email whenever
 * somebody gets to it; the chat promises a person, now, and the one failure the
 * team cannot recover from is a live conversation that goes quiet with no second
 * way to reach the buyer.
 */
const OpenChatBody = SubmitBody.omit({ phone: true }).extend({
  phone: str().min(4).max(60).trim(),
});

const SendMessageBody = z.object({ body: str().min(1).max(CHAT_MAX_BODY).trim() }).strict();

/**
 * The thread token travels in a HEADER, never in the query string.
 *
 * A URL is the one part of a request that gets written down everywhere: proxy
 * and server access logs, the browser's own history, and the `Referer` on any
 * request the page makes afterwards. A bearer token for somebody's private
 * conversation does not belong in any of them, and it was in all of them while
 * this was `?token=`.
 *
 * A custom header buys a second thing for free: it makes the request
 * non-simple, so a browser preflights it cross-origin and no plain HTML form
 * can forge one.
 */
const THREAD_TOKEN_HEADER = "x-thread-token";

function threadToken(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header(THREAD_TOKEN_HEADER)?.trim() ?? "";
}

function openingDoc(
  body: z.infer<typeof SubmitBody>,
  channel: EnquiryChannel,
  ip: string,
  threadKey: string | null,
): EnquiryDoc {
  const now = Date.now();
  return {
    _id: newId("enq", now),
    name: body.name,
    email: body.email,
    phone: body.phone?.trim() || null,
    message: body.message,
    channel,
    messages: [
      {
        id: newId("msg", now),
        from: "visitor",
        body: body.message,
        createdAt: now,
        authorId: null,
        authorName: body.name,
      },
    ],
    threadKey,
    propertyId: body.propertyId ?? null,
    propertySlug: body.propertySlug ?? null,
    propertyTitle: body.propertyTitle ?? null,
    status: "new",
    createdAt: now,
    updatedAt: now,
    lastVisitorAt: now,
    lastAgentAt: null,
    handledBy: null,
    note: null,
    sourceIp: ip === "unknown" ? null : ip,
    revision: 1,
  };
}

/**
 * The public intake.
 *
 * Public MUTATIONS, so they are mounted BELOW the origin guard and deliberately
 * NOT in the cacheable `/public/*` router. That router's whole safety property
 * is that a shared cache may store its responses; putting a write in it would
 * put "may be handed to another reader" and "creates a document" in one file.
 *
 * The thread READ is a GET and still belongs here rather than in the cacheable
 * router, for the same reason from the other direction: its response varies by a
 * bearer token, and a cacheable response that varies by a secret is one shared
 * cache away from handing one buyer's conversation to the next visitor. It sets
 * `no-store` itself and says so below.
 */
export function enquiriesPublicRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.post("/enquiries", async (c) => {
    /*
     * PARSED BEFORE THE LIMITER, and the order is the point.
     *
     * Validation is free: a JSON parse and a schema check, no I/O. The limiter
     * is a database write. Checking the cheap thing first means a malformed body
     * never costs a round trip to Atlas, and it still cannot be used to flood
     * anything, because every WELL-FORMED request below is still counted.
     */
    const body = await readJson(c, SubmitBody);

    const ip = clientIp(c);
    const db = await currentDb(c);
    // Bounds the deployment, not one warm instance, because the counter is a
    // document rather than a variable.
    await limit(db, `enquiry:${ip}`, ENQUIRY_IP_LIMIT, ENQUIRY_WINDOW_MS);

    if (body.website !== undefined && body.website.trim() !== "") {
      // Answers exactly like a success, and stores nothing.
      return c.json({ ok: true }, 201);
    }

    const doc = openingDoc(body, "form", ip, null);
    await enquiries(db).insertOne(doc);

    await notifyTeam(deps.mailer, doc, `New enquiry from ${doc.name}`, {
      requestId: c.get("requestId"),
      route: "POST /enquiries",
    });

    // The id is returned so a client can reference it in a support conversation.
    // Nothing else is: the caller wrote it, they do not need it read back.
    return c.json({ ok: true, id: doc._id }, 201);
  });

  /**
   * Opens a chat thread and hands back the only copy of its token.
   *
   * Counted against the SAME bucket as the contact form, because both create a
   * document and send mail, and letting one channel have its own allowance just
   * moves the flood to whichever is cheaper.
   */
  routes.post("/enquiries/chat", async (c) => {
    const body = await readJson(c, OpenChatBody);

    const ip = clientIp(c);
    const db = await currentDb(c);
    await limit(db, `enquiry:${ip}`, ENQUIRY_IP_LIMIT, ENQUIRY_WINDOW_MS);

    if (body.website !== undefined && body.website.trim() !== "") {
      /*
       * A bot gets a well-formed answer that leads nowhere: a real-looking id
       * and token over a thread that was never written. Refusing here, where the
       * form's honeypot returns 201, would tell a script exactly which field to
       * stop filling.
       */
      const now = Date.now();
      return c.json(
        {
          id: newId("enq", now),
          token: mintSessionToken(),
          thread: {
            id: newId("enq", now),
            status: "new" as const,
            propertyTitle: body.propertyTitle ?? null,
            messages: [],
            agentName: null,
            agentAvatarUrl: null,
            updatedAt: now,
          },
        },
        201,
      );
    }

    // Minted here and returned ONCE. Only its HMAC is stored, so this response
    // is the only moment the raw value exists anywhere we control.
    const token = mintSessionToken();
    const doc = openingDoc(body, "chat", ip, tokenId(token));
    await enquiries(db).insertOne(doc);

    const ctx = { requestId: c.get("requestId"), route: "POST /enquiries/chat" };
    await notifyTeam(deps.mailer, doc, `New chat from ${doc.name}`, ctx);
    // The buyer's own copy, from the first message: it is the receipt that says
    // the thread exists and how to get back to it if the tab is gone.
    await mailTranscript(deps.mailer, doc, ctx);

    return c.json({ id: doc._id, token, thread: await toThread(db, doc) }, 201);
  });

  routes.post("/enquiries/chat/:id/messages", async (c) => {
    const id = pathParam(c, "id");
    const body = await readJson(c, SendMessageBody);

    const ip = clientIp(c);
    const db = await currentDb(c);
    await limit(db, `chat:${ip}`, CHAT_MESSAGE_IP_LIMIT, CHAT_MESSAGE_WINDOW_MS);

    const doc = await loadOwnedThread(db, id, threadToken(c));
    if ((doc.messages ?? []).length >= CHAT_MAX_MESSAGES) {
      throw new BadRequestError(
        "This conversation has reached its length limit. Reply to the email transcript and it reaches the same person.",
      );
    }

    const now = Date.now();
    const message: EnquiryMessageDoc = {
      id: newId("msg", now),
      from: "visitor",
      body: body.body,
      createdAt: now,
      authorId: null,
      authorName: doc.name,
    };

    const after = await enquiries(db).findOneAndUpdate(
      { _id: id, threadKey: doc.threadKey },
      {
        $push: { messages: message },
        /*
         * A buyer writing again does NOT reopen a thread the team closed, but it
         * does un-close it back to `open` so it reappears in the working view.
         * Anything else means a closed conversation silently swallows the reply
         * that was asked for.
         */
        $set: {
          updatedAt: now,
          lastVisitorAt: now,
          ...(doc.status === "closed" ? { status: "open" as EnquiryStatus } : {}),
        },
        $inc: { revision: 1 },
      },
      { returnDocument: "after" },
    );
    if (!after) throw new NotFoundError(`thread ${id}`);

    await notifyTeam(deps.mailer, after, `Reply from ${after.name}`, {
      requestId: c.get("requestId"),
      route: "POST /enquiries/chat/:id/messages",
    });

    return c.json({ thread: await toThread(db, after) });
  });

  /**
   * The visitor polls this for replies.
   *
   * `no-store` is set explicitly rather than left to a default. This response is
   * a private conversation keyed by a bearer token, and the one thing that must
   * never happen is a CDN deciding the URL looks cacheable.
   */
  routes.get("/enquiries/chat/:id", async (c) => {
    const id = pathParam(c, "id");
    const db = await currentDb(c);
    const doc = await loadOwnedThread(db, id, threadToken(c));
    c.header("cache-control", "no-store, private");
    return c.json({ thread: await toThread(db, doc) });
  });

  return routes;
}

/* ─────────────────────────────── admin ────────────────────────────────── */

const ListQuery = z
  .object({
    limit: str().optional(),
    cursor: str().max(600).optional(),
    status: z.enum(ENQUIRY_STATUSES).optional(),
    channel: z.enum(["form", "chat"]).optional(),
  })
  .strict();

const UpdateBody = z
  .object({
    status: z.enum(ENQUIRY_STATUSES).optional(),
    note: str().max(4000).nullable().optional(),
    baseRevision: z.number().int().min(0),
  })
  .strict();

const ReplyBody = z
  .object({
    body: str().min(1).max(CHAT_MAX_BODY).trim(),
    baseRevision: z.number().int().min(0),
  })
  .strict();

export function enquiriesAdminRoutes(deps: { mailer: Mailer }): Hono<AppEnv> {
  const routes = new Hono<AppEnv>();

  routes.get("/admin/enquiries", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const q = readQuery(c, ListQuery);
    const size = clampLimit(q.limit);

    const and: Record<string, unknown>[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.channel) and.push({ channel: q.channel });
    const keyset = keysetFilter<EnquiryDoc>(SORT, q.cursor, SORT_NAME);
    if (Object.keys(keyset).length > 0) and.push(keyset);

    const docs = await enquiries(db)
      .find(and.length === 0 ? {} : { $and: and }, {
        projection: LIST_PROJECTION,
        sort: keysetSort(SORT),
        limit: size + 1,
      })
      .toArray();

    const { items, nextCursor } = takePage(docs, size, SORT, SORT_NAME);
    const names = await handlerNames(db, items.map((d) => d.handledBy));
    return c.json({
      items: items.map((d) => toEnquiry(d, d.handledBy ? (names.get(d.handledBy) ?? null) : null)),
      nextCursor,
    });
  });

  routes.get("/admin/enquiries/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const doc = await enquiries(db).findOne({ _id: id }, { projection: WIRE_PROJECTION });
    if (!doc) throw new NotFoundError(`enquiry ${id}`);
    const names = await handlerNames(db, [doc.handledBy]);
    return c.json({
      enquiry: toEnquiry(doc, doc.handledBy ? (names.get(doc.handledBy) ?? null) : null),
    });
  });

  /**
   * The agent's side of the conversation.
   *
   * CLAIMS THE THREAD as a side effect, the same way a status change does: the
   * person who answered is the person handling it, and an inbox where that has
   * to be remembered separately is an inbox where two agents answer the same
   * buyer.
   */
  routes.post("/admin/enquiries/:id/reply", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, ReplyBody);
    const user = currentUser(c);

    const site = await readSettings(db);
    const signature = replySignature(site, {
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    });

    const now = Date.now();
    const message: EnquiryMessageDoc = {
      id: newId("msg", now),
      from: "agent",
      body: body.body,
      createdAt: now,
      authorId: user.id,
      authorName: signature.name,
    };

    const after = await enquiries(db).findOneAndUpdate(
      { _id: id, revision: body.baseRevision },
      {
        $push: { messages: message },
        $set: {
          updatedAt: now,
          lastAgentAt: now,
          handledBy: user.id,
          // A reply is the definition of "being worked". Leaving it `new` means
          // the row keeps claiming nobody has touched it.
          status: "open" as EnquiryStatus,
        },
        $inc: { revision: 1 },
      },
      { returnDocument: "after" },
    );

    if (!after) {
      const current = await enquiries(db).findOne({ _id: id }, { projection: WIRE_PROJECTION });
      if (!current) throw new NotFoundError(`enquiry ${id}`);
      const names = await handlerNames(db, [current.handledBy]);
      /*
       * A 409 carrying the OTHER version, so the screen can show what it missed.
       * On a conversation this is not a merge conflict to resolve: it is almost
       * always a colleague's reply that arrived first, and the right move is to
       * read it before sending yours.
       */
      throw new StaleWriteError(
        "enquiry",
        body.baseRevision,
        current.revision,
        toEnquiry(current, current.handledBy ? (names.get(current.handledBy) ?? null) : null),
      );
    }

    // The buyer's durable copy. A chat thread lives in one browser; the mail is
    // what survives a closed tab.
    await mailTranscript(deps.mailer, after, {
      requestId: c.get("requestId"),
      route: "POST /admin/enquiries/:id/reply",
    });

    const names = await handlerNames(db, [after.handledBy]);
    return c.json({
      enquiry: toEnquiry(after, after.handledBy ? (names.get(after.handledBy) ?? null) : null),
    });
  });

  routes.patch("/admin/enquiries/:id", requireAuth(), async (c) => {
    const db = await currentDb(c);
    const id = pathParam(c, "id");
    const body = await readJson(c, UpdateBody);
    const user = currentUser(c);
    const now = Date.now();

    const set: Partial<EnquiryDoc> = { updatedAt: now };
    if (body.status !== undefined) {
      set.status = body.status;
      // Whoever moved it off "new" owns it. Recorded here rather than asked for,
      // because an inbox where everyone has to remember to claim a row is an
      // inbox where nobody does.
      set.handledBy = body.status === "new" ? null : user.id;
    }
    if (body.note !== undefined) set.note = body.note;

    const after = await enquiries(db).findOneAndUpdate(
      { _id: id, revision: body.baseRevision },
      { $set: set, $inc: { revision: 1 } },
      { returnDocument: "after", projection: WIRE_PROJECTION },
    );
    if (!after) {
      const current = await enquiries(db).findOne({ _id: id }, { projection: WIRE_PROJECTION });
      if (!current) throw new NotFoundError(`enquiry ${id}`);
      const names = await handlerNames(db, [current.handledBy]);
      throw new StaleWriteError(
        "enquiry",
        body.baseRevision,
        current.revision,
        toEnquiry(current, current.handledBy ? (names.get(current.handledBy) ?? null) : null),
      );
    }

    const names = await handlerNames(db, [after.handledBy]);
    return c.json({
      enquiry: toEnquiry(after, after.handledBy ? (names.get(after.handledBy) ?? null) : null),
    });
  });

  return routes;
}

/** Counts by status, for the dashboard. One aggregation, not five counts. */
export async function enquiryCounts(db: Db): Promise<Record<EnquiryStatus, number>> {
  const rows = await enquiries(db)
    .aggregate<{ _id: EnquiryStatus; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    .toArray();
  const out: Record<EnquiryStatus, number> = { new: 0, open: 0, closed: 0, spam: 0 };
  for (const row of rows) {
    if (row._id in out) out[row._id] = row.count;
  }
  return out;
}

export { readSettings, replySignature, settingsRoutes } from "./settings";
